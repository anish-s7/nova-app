import { AuthForm } from "@/components/auth/auth-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error, notice } = await searchParams;
  return (
    <AuthForm
      mode="login"
      next={typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : undefined}
      initialError={typeof error === "string" ? error : undefined}
      initialNotice={typeof notice === "string" ? notice : undefined}
    />
  );
}
