import { redirect } from "next/navigation";

/** Legacy path; canonical learner registration wizard is `/auth/callback/signup`. */
export default function SignUpPageRedirect() {
  redirect("/auth/callback/signup");
}
