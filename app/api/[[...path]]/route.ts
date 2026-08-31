import { handleLegacyRequest } from '@/lib/legacy-adapter';

export const dynamic = 'force-dynamic';

export const GET = handleLegacyRequest;
export const POST = handleLegacyRequest;
export const PATCH = handleLegacyRequest;
export const DELETE = handleLegacyRequest;
