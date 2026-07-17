import { permanentRedirect } from "next/navigation";

const TERMS_OF_SERVICE_URL = "https://hanami.yorunoken.com/legal/terms";

export default function TosPage() {
    permanentRedirect(TERMS_OF_SERVICE_URL);
}
