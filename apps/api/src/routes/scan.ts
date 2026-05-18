import { Router, Request, Response } from "express";
import multer from "multer";
import logger from "../utils/logger";

const router = Router();

// Store uploaded files in memory
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

router.post("/extract", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
        res.status(400).json({ error: "No image file provided" });
        return;
    }

    const mlServiceUrl = process.env.ML_SERVICE_URL || "http://localhost:8000";
    const targetUrl = `${mlServiceUrl}/ocr/extract`;

    logger.info(`Proxying file upload (${req.file.originalname}, ${req.file.size} bytes) to ML OCR service at ${targetUrl}`);

    try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(req.file.buffer)], { type: req.file.mimetype });
        formData.append("file", blob, req.file.originalname);

        const response = await fetch(targetUrl, {
            method: "POST",
            body: formData,
            signal: AbortSignal.timeout(30000), // 30s timeout
        });

        if (!response.ok) {
            let errorDetail = `ML Service returned status ${response.status}`;
            try {
                const errorBody = (await response.json()) as { detail?: string };
                if (errorBody.detail) errorDetail = errorBody.detail;
            } catch {
                // Ignore parse error
            }
            logger.error(`ML OCR service error: ${errorDetail}`);
            res.status(response.status).json({ error: errorDetail });
            return;
        }

        const data = await response.json();
        logger.info(`ML OCR extraction successful: ${JSON.stringify(data)}`);
        res.status(200).json(data);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to connect to ML OCR service: ${msg}`);
        res.status(503).json({
            error: "OCR service is currently unavailable. Please verify manually.",
            details: msg,
        });
    }
});

export default router;
