export class ApiError extends Error {
  constructor(
    message: string,
    public code: "unavailable" | "failed" = "failed",
  ) {
    super(message);
  }
}
