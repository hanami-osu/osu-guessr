import { apiErrorResponse } from "@/lib/api/errors";
import { validateApiKey } from "@/lib/api/validate-key";

type ApiRouteOptions = {
    fallbackMessage: string;
    logLabel: string;
};

export async function withApiKey(request: Request, handler: () => Promise<Response>, { fallbackMessage, logLabel }: ApiRouteOptions): Promise<Response> {
    try {
        await validateApiKey(request.headers.get("X-API-Key"));
        return await handler();
    } catch (error) {
        return apiErrorResponse(error, fallbackMessage, logLabel);
    }
}
