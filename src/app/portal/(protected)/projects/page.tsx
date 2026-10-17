import type { ReactElement } from "react";
import { clientForPage } from "../../../../lib/auth/client-page";
import { ProjectList } from "../../../../components/project-views";
export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<ReactElement> {
  return (
    <ProjectList
      actor={await clientForPage()}
      statusFilter={(await searchParams).status}
    />
  );
}
