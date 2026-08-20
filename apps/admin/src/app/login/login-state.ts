export type RequestCodeState = {
  status: "idle" | "invalid" | "sent" | "unavailable";
  email: string;
  message: string | null;
  requestedAt: number | null;
};

export type VerifyCodeState = {
  status: "idle" | "invalid" | "unavailable";
  message: string | null;
};

export const initialRequestCodeState: RequestCodeState = {
  status: "idle",
  email: "",
  message: null,
  requestedAt: null,
};

export const initialVerifyCodeState: VerifyCodeState = {
  status: "idle",
  message: null,
};
