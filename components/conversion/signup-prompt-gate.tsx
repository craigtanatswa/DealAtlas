"use client";

import { SignupPrompt } from "@/components/conversion/signup-prompt";
import { useViewerStatus } from "@/components/viewer/viewer-provider";

export function SignupPromptGate() {
  const status = useViewerStatus();
  return <SignupPrompt enabled={status === "anonymous"} />;
}
