import type { ReactElement } from "react";
import { clientForPage } from "../../../../../lib/auth/client-page";
import { ProjectWorkspace } from "../../../../../components/project-views";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  return (
    <ProjectWorkspace id={(await params).id} actor={await clientForPage()} />
  );
}
