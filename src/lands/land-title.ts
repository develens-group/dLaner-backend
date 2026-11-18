import { BadRequestException, ConflictException } from '@nestjs/common';
export const cleanLandTitle = (title: string) =>
  title.normalize('NFKC').replace(/\s+/gu, ' ').trim();
export const landTitleKey = (title: string) =>
  cleanLandTitle(title).toLowerCase();
export function chooseLandTitle(
  title: string,
  existing: string[],
  automatic = false,
) {
  const cleaned = cleanLandTitle(title);
  if (!cleaned || cleaned.length > 150)
    throw new BadRequestException(
      'Land name must contain 1 to 150 characters.',
    );
  const used = new Set(existing.map(landTitleKey));
  if (automatic && landTitleKey(cleaned) === 'untitled design') {
    let number = 1;
    while (used.has(`untitled design ${number}`)) number++;
    return `Untitled design ${number}`;
  }
  if (used.has(landTitleKey(cleaned)))
    throw new ConflictException({
      code: 'LAND_TITLE_EXISTS',
      message:
        'You already have a land with this name. Choose a different name.',
    });
  return cleaned;
}
