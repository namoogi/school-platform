import { handlePlatform } from '@/lib/api';
import { revokeInspectorToken } from '@/lib/inspector';

/** 폐기 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handlePlatform(req, ({ db }) => revokeInspectorToken(db, id));
}
