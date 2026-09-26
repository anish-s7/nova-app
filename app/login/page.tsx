import { AuthForm } from "@/components/auth/auth-form";
import { safeNextPath } from "@/lib/safe-next";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return <AuthForm mode="login" next={typeof next === "string" ? safeNextPath(next) : undefined} initialError={typeof error === "string" ? error : undefined} />;
}
