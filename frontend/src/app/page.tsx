import { redirect } from "next/navigation";

/** Arrival is login. There is no public site. */
export default function HomePage() {
  redirect("/giris");
}
