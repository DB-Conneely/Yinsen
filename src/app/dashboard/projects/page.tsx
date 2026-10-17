import type { ReactElement } from "react";
import { operatorForPage } from "../../../lib/auth/page";
import { ProjectList } from "../../../components/project-views";
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<ReactElement> {
  return (
    <ProjectList
      actor={await operatorForPage()}
      statusFilter={(await searchParams).status}
    />
  );
}
