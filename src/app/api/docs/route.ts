import { redirect } from "next/navigation";

export async function GET() {
    return redirect("https://github.com/hanami-osu/osu-guessr/blob/main/docs/API.md");
}
