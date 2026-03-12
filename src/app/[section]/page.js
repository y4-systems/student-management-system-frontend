import { notFound } from 'next/navigation';
import LegacyPortalShell from '../LegacyPortalShell';

const allowedSections = new Set([
  'dashboard',
  'students',
  'courses',
  'enrollments',
  'grades',
]);

export default async function SectionPage({ params }) {
  const { section } = await params;
  const normalized = String(section || '').toLowerCase();

  if (!allowedSections.has(normalized)) {
    notFound();
  }

  return <LegacyPortalShell initialPage={normalized} />;
}