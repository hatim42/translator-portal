import { chatGPTSignInPath, chatGPTSignOutPath } from "./chatgpt-auth";
import PortalClient from "./portal-client";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <PortalClient
      signInPath={chatGPTSignInPath("/")}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
