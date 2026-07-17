import { permanentRedirect } from "next/navigation";

const PRIVACY_POLICY_URL = "https://hanami.yorunoken.com/legal/privacy";

export default function PrivacyPolicyPage() {
    permanentRedirect(PRIVACY_POLICY_URL);
}
