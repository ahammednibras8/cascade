export type Task = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  deployment: {
    id: string;
    version: string;
    status: string;
  } | null;
  runsCount: number;
  schedulesCount: number;
  createdAt: string;
  updatedAt: string;
};
