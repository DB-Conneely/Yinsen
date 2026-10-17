import type { ReactElement } from "react";
import { operatorForPage } from "../../../../lib/auth/page";
import { ProjectWorkspace } from "../../../../components/project-views";
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  return (
    <ProjectWorkspace id={(await params).id} actor={await operatorForPage()} />
  );
}
