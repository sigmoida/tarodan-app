import { SellerType } from "@prisma/client";

/**
 * İlk ilanla satıcı moduna geçiş verisi.
 *
 * `sellerType` yalnız hiç atanmamışsa "individual" olur — kurumsal akış
 * aktivasyonda "verified" yazar ve nihai onaya kadar `isSeller=false`
 * kaldığından, eski koşulsuz atama ilk ilanda bu tipi "individual" ile
 * eziyordu.
 */
export function sellerAutoEnableData(seller: {
  sellerType: SellerType | null;
}): { isSeller: true; sellerType: SellerType } {
  return {
    isSeller: true,
    sellerType: seller.sellerType ?? SellerType.individual,
  };
}
