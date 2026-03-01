import multer from "multer";

export const csvStorage = multer.memoryStorage();

export const csvUpload = multer({ storage: csvStorage });
