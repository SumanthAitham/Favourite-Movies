"use client";

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("We couldn’t connect just now. Please try again.");
  }
  if (!response.ok) {
    const error = data as { error?: { message?: string } };
    throw new Error(
      error.error?.message || "Something went wrong. Please try again.",
    );
  }
  return data as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
