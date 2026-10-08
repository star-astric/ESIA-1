import { api, unwrapApiResult } from "../lib/api";

export interface ProductListParams {
  categoryId?: number;
  category?: string;
  categorySlug?: string;
}

export const productsService = {
  async list(params?: ProductListParams) {
    const response = await api.get("/products", { params });
    return (unwrapApiResult<any[]>(response) ?? []);
  },
  async byId(id: string | number) {
    const response = await api.get("/products/" + encodeURIComponent(String(id)));
    return unwrapApiResult<any>(response);
  },
  async create(input: FormData | Record<string, unknown>) {
    const response = await api.post("/products", input);
    return unwrapApiResult<any>(response);
  },
  async update(id: string | number, input: FormData | Record<string, unknown>) {
    const response = await api.patch("/products/" + encodeURIComponent(String(id)), input);
    return unwrapApiResult<any>(response);
  },
  async remove(id: string | number) {
    const response = await api.delete("/products/" + encodeURIComponent(String(id)));
    return unwrapApiResult<any>(response);
  },
  async uploadCover(id: string | number, file: File) {
    const form = new FormData();
    form.append("cover", file);
    const response = await api.post(
      "/products/" + encodeURIComponent(String(id)) + "/cover",
      form,
    );
    return unwrapApiResult<any>(response);
  },
  async removeCover(id: string | number) {
    const response = await api.delete(
      "/products/" + encodeURIComponent(String(id)) + "/cover",
    );
    return unwrapApiResult<any>(response);
  },
  async addImages(id: string | number, input: FormData) {
    const response = await api.post(
      "/products/" + encodeURIComponent(String(id)) + "/images",
      input,
    );
    return unwrapApiResult<any>(response);
  },
  async setImageColor(id: string | number, imageId: number, colorId: number | null) {
    const response = await api.patch(
      "/products/" + encodeURIComponent(String(id)) + "/images/" + encodeURIComponent(String(imageId)) + "/color",
      { colorId: colorId ?? "" },
    );
    return unwrapApiResult<any>(response);
  },
  async removeImage(id: string | number, order: number) {
    const response = await api.delete(
      "/products/" + encodeURIComponent(String(id)) + "/images/" + encodeURIComponent(String(order)),
    );
    return unwrapApiResult<any>(response);
  },
  async reorderImages(id: string | number, currentOrder: number, newOrder: number) {
    const response = await api.put(
      "/products/" + encodeURIComponent(String(id)) + "/images/reorder",
      { currentOrder, newOrder },
    );
    return unwrapApiResult<any>(response);
  },
};
