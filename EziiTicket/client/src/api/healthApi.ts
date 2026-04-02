import { http } from "./httpClient";

export type HealthResponse = {
  ok: boolean;
  service: string;
  env: string;
  db: {
    configured: boolean;
    ok: boolean;
  };
  error?: string;
};

export function getHealth() {
  return http<HealthResponse>("/health");
}

