export interface ApiResponse<T> {
  data: T;
  meta: Record<string, unknown> | null;
}

export const response = <T>(
  data: T,
  meta: Record<string, unknown> | null = null,
): ApiResponse<T> => ({
  data,
  meta,
});
