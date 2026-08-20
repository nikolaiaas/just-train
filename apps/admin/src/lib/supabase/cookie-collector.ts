import "server-only";

import type { NextResponse } from "next/server";

import type { AdminCookie, AdminCookieAdapter } from "./server-client";

export class CookieMutationCollector implements AdminCookieAdapter {
  readonly #cookies = new Map<string, { name: string; value: string }>();
  readonly #mutations = new Map<string, AdminCookie>();
  readonly #cacheHeaders = new Map<string, string>();

  constructor(initialCookies: { name: string; value: string }[]) {
    for (const cookie of initialCookies) {
      this.#cookies.set(cookie.name, cookie);
    }
  }

  getAll = (): { name: string; value: string }[] => {
    return [...this.#cookies.values()];
  };

  setAll = (
    cookies: AdminCookie[],
    cacheHeaders: Record<string, string>,
  ): void => {
    for (const cookie of cookies) {
      this.#cookies.set(cookie.name, {
        name: cookie.name,
        value: cookie.value,
      });
      this.#mutations.set(cookie.name, cookie);
    }

    for (const [name, value] of Object.entries(cacheHeaders)) {
      this.#cacheHeaders.set(name, value);
    }
  };

  apply(response: NextResponse): void {
    for (const { name, value, options } of this.#mutations.values()) {
      response.cookies.set({ name, value, ...options });
    }

    for (const [name, value] of this.#cacheHeaders) {
      response.headers.set(name, value);
    }
  }
}
