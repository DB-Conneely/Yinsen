import type { ReactElement } from "react";
import { operatorForPage } from "../../../../lib/auth/page";
import { ProjectEditor } from "../../../../components/project-views";
export default async function NewProjectPage(): Promise<ReactElement> {
  return <ProjectEditor actor={await operatorForPage()} />;
}
