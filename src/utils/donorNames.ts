// Donor names: the Yiddish name is shown first when the donor has one; the English name is the fallback.
type NamedDonor = { name?: string; firstName?: string; lastName?: string; preTitle?: string; hebFirstName?: string; hebLastName?: string; title?: string; postTitle?: string };

export const yiddishName = (donor?: NamedDonor | null) =>
  donor ? [donor.preTitle, donor.hebFirstName, donor.hebLastName, donor.title, donor.postTitle].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() : '';

export const englishName = (donor?: NamedDonor | null) =>
  donor ? (donor.name || [donor.firstName, donor.lastName].filter(Boolean).join(' ')).trim() : '';

/** The main name to show (Yiddish if there is one) and the other name to show small underneath. */
export const donorNames = (donor?: NamedDonor | null) => {
  const yiddish = yiddishName(donor); const english = englishName(donor);
  return yiddish ? { main: yiddish, other: english, rtl: true } : { main: english || 'Unknown donor', other: '', rtl: false };
};
