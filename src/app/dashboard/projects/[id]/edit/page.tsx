import type { ReactElement } from "react";
import { operatorForPage } from "../../../../../lib/auth/page";
import { ProjectEditor } from "../../../../../components/project-views";
export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  return (
    <ProjectEditor id={(await params).id} actor={await operatorForPage()} />
  );
}
