import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient } from "../generated/prisma/client.js";
import authenticator from "../middlewares/auth.middleware.js";
import '../config/passport.config.js';
import * as z from "zod";
import fileUpload from "express-fileupload";
import path from "path";
import { mkdir, unlink, rename } from "fs/promises";

const uploadsRouter = Router();
const prisma = new PrismaClient();

uploadsRouter.use(fileUpload({
  preserveExtension: true,
  abortOnLimit: false,
  limits: { fileSize: 1.5 * 1024 * 1024 } // 1.5MB
}));

const userUploadSchema = z.object({
  category: z.enum(["poster", "whatsapp", "instagram"])
})

uploadsRouter.post("/", authenticator, async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).send("Unauthorized");
  }

  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send({ msg: 'No files were uploaded.' });
  }

  const user = await prisma.user.findUnique({
    where: { userId: req.user.userId },
    select: { storageUsage: true }
  })

  if (user.storageUsage > Number(process.env.USER_STORAGE_LIMIT)) {
    return res.status(413).send({ msg: "User quota exhausted" })
  }

  const parsedBody = userUploadSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).send({ msg: 'Pls send category ("poster"/"whatsapp"/"instagram")' });
  }
  if (parsedBody.data.category === "poster" && req.user.role !== "admin") {
    return res.status(403).send({ msg: "Only admins can upload posters" });
  }

  const uploadDir = path.join("public", "uploads", "pending");
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];

  try {
    const savedFiles: any = [];
    const failedFiles: any = [];

    for (const key in req.files) {
      const files = Array.isArray(req.files[key]) ? req.files[key] : [req.files[key]];
      if(files.length > 3) {
        return res.status(400).send({ msg: 'You can upload a maximum of 3 files at once.' });
      }

      
      files.forEach(file => {
        if (!allowedExtensions.includes(path.extname(file.name).toLowerCase())) {
          failedFiles.push({ name: file.name, reason: 'Invalid file extension' });
          return;
        }
        if (!allowedMimeTypes.includes(file.mimetype)) {
          failedFiles.push({ name: file.name, reason: 'Invalid file type' });
          return;
        }
        if(file.truncated) {
          failedFiles.push({ name: file.name, reason: 'File size exceeds limit' });
          return;
        }
  
        const uploadPath = path.join(uploadDir, `${req.user.userId}_${Date.now()}_${file.name}`);
        file.mv(uploadPath, async (err) => {
          if (err) {
            console.error('File upload error:', err);
            return res.status(500).send({ msg: 'File upload failed.' });
          }
  
          await prisma.$transaction([
            prisma.upload.create({
              data: {
                userId: req.user.userId,
                filePath: uploadPath,
                category: parsedBody.data.category,
                fileSize: file.size,
              }
            }),
            prisma.user.update({
              where: { userId: req.user.userId },
              data: {
                storageUsage: { increment: file.size }
              }
            })
          ])
  
        });

        savedFiles.push({ name: file.name, path: uploadPath });
      })
    }

    return res.send({ savedFiles, failedFiles });

  } catch (err) {
    if ((err as any).code === 'ENOENT') {
      try {
        await mkdir(uploadDir, { recursive: true });
        console.log('Upload directory created, please retry the upload.');
        return res.status(500).send({ msg: 'Upload directory was missing and has been created. Please retry the upload.' });
      } catch (mkdirErr) {
        console.error('Error creating upload directory:', mkdirErr);
        return res.status(500).send({ msg: 'Error creating upload directory.' });
      }
    }
    console.error('Unexpected error during file upload:', err);
    return res.status(500).send({ msg: 'Unexpected error during file upload.' });
  }
})

const getUploadsFilterSchema = z.object({
  category: z.enum(["poster", "whatsapp", "instagram"]).optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  username: z.string().optional(),
  uploadId: z.coerce.number().optional()
});

uploadsRouter.get("/", authenticator, async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).send("Unauthorized");
  }

  const parsedQuery = getUploadsFilterSchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).send({ msg: "Invalid query parameters" });
  }

  const uploads = await prisma.upload.findMany({
    where: {
      ...(req.user.role === "CA" ? { userId: req.user.userId } : {}),
      ...(parsedQuery.data.category ? { category: parsedQuery.data.category } : {}),
      ...(parsedQuery.data.status ? { status: parsedQuery.data.status } : {}),
      ...(parsedQuery.data.uploadId ? { uploadId: parsedQuery.data.uploadId } : {}),
      ...(parsedQuery.data.username ? { user: { name: { contains: parsedQuery.data.username, mode: "insensitive" } } } : {})
    },
    select: {
      uploadId: true,
      filePath: true,
      category: true,
      status: true,
      fileSize: true,
      createdAt: true,
      user: req.user.role === "admin" ? true : { select: { name: true } }
    },
    orderBy: { createdAt: "desc" }
  })

  return res.send(uploads);
});


const updateUploadStatusSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  points: z.coerce.number().min(-1).default(-1),
})

uploadsRouter.put("/:uploadId", authenticator, async (req: Request, res: Response) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).send("Forbidden");
  }

  const uploadId = Number(req.params.uploadId);
  if (isNaN(uploadId)) {
    return res.status(400).send({ msg: "Invalid upload ID" });
  }

  const parsedBody = updateUploadStatusSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).send({ msg: "Invalid status value or points value", errors: parsedBody.error });
  }

  const newStatus = parsedBody.data.status;
  const newDir = path.join("public", "uploads", "approved");

  try {
    const upload = await prisma.upload.findUnique({ where: { uploadId } });
    if (!upload) {
      return res.status(404).send({ msg: "Upload not found" });
    }

    if(upload.status !== "pending") {
      return res.status(400).send({ msg: "Only pending uploads can be approved/rejected" });
    }
    const oldPath = upload.filePath;
    
    if(newStatus === "approved") {
      if(parsedBody.data.points < 0) {
        return res.status(400).send({ msg: "Points must be provided and non-negative when approving an upload" });
      }
      const newPath = path.join(newDir, path.basename(oldPath));
      await rename(path.join(process.cwd(), oldPath), path.join(process.cwd(), newPath));
      await prisma.upload.update({
        where: { uploadId },
        data: {
          status: newStatus,
          filePath: newPath,
          user: {
            update: {
              points: { increment: parsedBody.data.points }
            }
          }
        }
      });
    }

    else {
      await unlink(oldPath);
      await prisma.upload.update({
        where: { uploadId },
        data: {
          status: newStatus,
          filePath: null,
          user: {
            update: {
              storageUsage: { decrement: upload.fileSize }
            }
          }
        }
      });
    }
  } catch (err) {
    console.error('Error updating upload status:', err);
    return res.status(500).send({ msg: 'Error updating upload status.' });
  }

  return res.send({ msg: `Status set to ${newStatus} successfully.` });
});

export default uploadsRouter;