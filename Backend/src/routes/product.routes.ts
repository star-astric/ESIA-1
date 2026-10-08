import { Router } from "express";
import { protect, adminOnly } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";
import { processMedia } from "../middlewares/media.middleware";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  uploadProductCover,
  removeProductCover,
  addProductImages,
  setProductImageColor,
  removeProductImage,
  reorderProductImages,
} from "../controllers/product.controller";

const router = Router();

// Public reads — list (cover + basics for card) and detail (cover + full file gallery)
router.get("/", getAllProducts);
router.get("/:id", getProductById);

// Admin writes — upload.any() + processMedia (compress, validate 3MB image) before controller
// Gallery images are FILES ONLY: fieldnames image[0], image[1], ... (or images/files).
// Cover image is a SINGLE FILE on the product itself: fieldname cover (or coverImage).
router.post("/", protect, adminOnly, upload.any(), processMedia, createProduct);
router.patch("/:id", protect, adminOnly, upload.any(), processMedia, updateProduct);
router.delete("/:id", protect, adminOnly, deleteProduct);

// Cover image (single file on the product row)
router.post("/:id/cover", protect, adminOnly, upload.any(), processMedia, uploadProductCover);
router.delete("/:id/cover", protect, adminOnly, removeProductCover);

// Gallery management for existing product (files only, ordered by sort_order)
router.post("/:id/images", protect, adminOnly, upload.any(), processMedia, addProductImages);
router.patch("/:id/images/:imageId/color", protect, adminOnly, setProductImageColor);
// Alternative alias
router.post("/:id/media", protect, adminOnly, upload.any(), processMedia, addProductImages);

// Remove gallery image by sort order or image id
router.delete("/:id/images/:order", protect, adminOnly, removeProductImage);
router.delete("/:id/media", protect, adminOnly, removeProductImage);

// Reorder gallery images: body { currentOrder, newOrder }
router.put("/:id/images/reorder", protect, adminOnly, reorderProductImages);
router.put("/:id/media/reorder", protect, adminOnly, reorderProductImages);

export default router;
