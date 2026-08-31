import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useZodForm } from "@tarodan/ui/form";
import { listingsApi, userApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import {
  toEditListingValues,
  buildListingUpdatePayload,
  createEmptySaleData,
  saleDataToPayload,
  type SaleData,
} from "@tarodan/listing-form";
import {
  buildListingFormData,
  buildSaleDataFromListing,
} from "@tarodan/listing-form";
import {
  editListingSchema,
  emptyEditValues,
  type EditListingValues,
} from "@tarodan/listing-form";
import type {
  EditListingFormData,
  ListingEditPayload,
} from "@tarodan/listing-form";

interface UseEditListingFormParams {
  id: string;
  authLoading: boolean;
  isAuthenticated: boolean;
}

/** Normalize the mixed-typed merge result into all-string form values. */

export function useEditListingForm({
  id,
  authLoading,
  isAuthenticated,
}: UseEditListingFormParams) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useZodForm(editListingSchema, {
    defaultValues: emptyEditValues,
  });
  const { reset, formState } = form;

  // Shared submit/lifecycle busy flag (also driven by `useListingLifecycle`).
  const [isLoading, setIsLoading] = useState(false);
  // Store preview URLs separately (presigned URLs for display).
  const [showDiscountSection, setShowDiscountSection] = useState(false);
  const [saleData, setSaleData] = useState<SaleData>(createEmptySaleData);
  const [readyFormId, setReadyFormId] = useState<string | null>(null);

  // Auth gate.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      toast.error(t("product.loginRequiredToEdit"));
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  /**
   * İlanın DÜZENLEME kaydını yükle.
   *
   * Yalnız sahibe açık uç kullanılır; 403/404 "bu ilan sizin değil" demektir ve
   * aşağıdaki hata etkisi kullanıcıyı listeye geri gönderir. Eskiden bu durumda
   * herkese açık uca düşülüyordu — o uç 10 dakika cache'li olduğu için düzenleme
   * ekranı bayat veriyle açılabiliyordu.
   *
   * Bu ekranda ÖNBELLEK YOK: her açılışta ve her odaklanmada kayıt yeniden
   * çekilir. Bayat bir değer, satıcının o an geçerli olmayan veriyi geri
   * kaydetmesi demek.
   */
  const listingQuery = useQuery({
    queryKey: queryKeys.listingEdit.detail(id),
    queryFn: async () => {
      const response = await userApi.getMyProductById(id);
      const payload = response.data.product || response.data;
      // Kayıt bloğu yoksa form sessizce boş açılır ve satıcı boş bir ilanı
      // kaydetmeye çalışır. Yükleme hatası say: hata etkisi listeye döndürür.
      if (!payload?.edit) throw new Error("listing-edit-payload-missing");
      return payload as { edit: ListingEditPayload };
    },
    enabled: !authLoading && isAuthenticated && !!id,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    meta: { page: "listing-edit" },
  });

  useEffect(() => {
    if (!listingQuery.isError) return;
    toast.error(
      (listingQuery.error as any)?.response?.data?.message ||
        t("product.loadFailed"),
    );
    router.push("/profile/listings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingQuery.isError]);

  /**
   * Formu gelen kayıttan doldur.
   *
   * İşaret hangi İLANIN doldurulduğunu tutar, "doldurdum mu" bilgisini değil:
   * aynı segmentte ilandan ilana geçildiğinde bileşen unmount olmadığı için
   * boolean bir işaret formu önceki ilanın verisiyle bırakıyordu.
   *
   * Kullanıcı forma dokunduysa (`isDirty`) taze veri yazılmaz — aksi halde
   * odak değişimindeki bir refetch, satıcının yazdıklarını silerdi.
   */
  const populatedForRef = useRef<string | null>(null);
  /**
   * Görsel gönderim engeli. Buton kapatmak yetmez: Enter ile gönderim ve
   * programatik çağrı da bu kapıdan geçmeli.
   */
  const imageSubmitBlockerRef = useRef<{ message: string } | null>(null);
  /**
   * Kullanıcı görsellere dokundu mu? `formState.isDirty` tek başına YETMEZ:
   * bekleyen bir yükleme forma henüz yazılmadığı için form "temiz" görünür ve
   * focus refetch'i yüklenmekte olan görseli ekrandan silerdi.
   */
  const hasUserImageEditsRef = useRef(false);
  /**
   * Görsel listesini dolduran callback. Hook sırası yüzünden (form önce, görsel
   * durumu sonra) doğrudan çağıramıyoruz; kayıt yüklenince tetiklenmesi için
   * ref üzerinden bağlanır.
   */
  const seedExistingImagesRef = useRef<
    | ((
        images: Array<{
          cardKey: string;
          detailKey: string;
          cardUrl?: string | null;
          detailUrl?: string | null;
        }>,
        sessionId?: string,
      ) => void)
    | null
  >(null);
  useEffect(() => {
    const edit = listingQuery.data?.edit;
    if (!edit) return;
    if (populatedForRef.current === id) {
      if (formState.isDirty || hasUserImageEditsRef.current) return;
    }
    populatedForRef.current = id;

    const { newFormData } = buildListingFormData(edit);
    reset(toEditListingValues(newFormData));
    // Kayıtlı görseller `uploaded` olarak yerleşir; yeniden YÜKLENMEZ.
    // İlan kimliği geçilir: aynı ilanda refetch kullanıcının düzenini ezmez,
    // BAŞKA ilana geçildiğinde liste zorunlu olarak yenilenir.
    seedExistingImagesRef.current?.(edit.images ?? [], id);

    const { saleData: nextSaleData, saleActive } =
      buildSaleDataFromListing(edit);
    setSaleData(nextSaleData);
    setShowDiscountSection(saleActive);
    setReadyFormId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingQuery.data, id]);

  const isFetching = !id
    ? false
    : authLoading ||
      listingQuery.isPending ||
      (!!listingQuery.data?.edit && readyFormId !== id);

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      listingsApi.update(id, payload as any),
    onMutate: () => setIsLoading(true),
    onSuccess: () => {
      toast.success(t("product.listingUpdated"));
      queryClient.invalidateQueries({ queryKey: queryKeys.product.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.profileListings.all(),
      });
      router.push(`/listings/${id}`);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message || t("product.updateFailed")),
    onSettled: () => setIsLoading(false),
  });

  const onSubmit = (values: EditListingValues) => {
    if (imageSubmitBlockerRef.current) {
      toast.error(imageSubmitBlockerRef.current.message);
      return;
    }
    updateMutation.mutate(buildListingUpdatePayload(values, saleData));
  };

  return {
    form,
    onSubmit,
    /** Kaydın kendisi — bağlı listeleri slug'la hemen açabilmek için. */
    record: listingQuery.data?.edit ?? null,
    saleData,
    setSaleData,
    seedExistingImagesRef,
    imageSubmitBlockerRef,
    hasUserImageEditsRef,
    showDiscountSection,
    setShowDiscountSection,
    isLoading,
    setIsLoading,
    isFetching,
  };
}
