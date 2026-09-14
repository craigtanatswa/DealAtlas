import type { Role } from "@/lib/constants";

export type AppProfile = {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
};
