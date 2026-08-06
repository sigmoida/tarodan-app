import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useZodForm } from "@tarodan/ui/form";
import { listingsApi, userApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import {
  createEmptySaleData,
  saleDataToPayload,
  type SaleData,
} from "@/components/listings/form";
import {
  buildListingFormData,
  buildSaleDataFromListing,
} from "../_lib/build-edit-form-data";
import {
  editListingSchema,
  emptyEditValues,
  type EditListingValues,
} from "../_lib/schema";
import type { EditListingFormData, ListingEditPayload } from "../_lib/types";

interface UseEditListingFormParams {
  id: string;
  authLoading: boolean;
  isAuthenticated: boolean;
}

/** Normalize the mixed-typed merge result into all-string form values. */
function toValues(fd: EditListingFormData): EditListingValues {
  return {
    ...emptyEditValues,
    ...fd,
    year: fd.year !== undefined && fd.year !== null ? String(fd.year) : "",
    quantity:
      fd.quantity !== undefined && fd.quantity !== null && fd.quantity !== ""
        ? String(fd.quantity)
        : "",
    shippingPackageTier: fd.shippingPackageTier ?? "small",
    bundleSize:
      fd.bundleSize !== undefined && fd.bundleSize !== null
        ? String(fd.bundleSize)
        : "",
  };
}

export function useEditListingForm({
  id,
  authLoading,
  isAuthenticated,
}: UseEditListingFormParams) {
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
      toast.error("İlan düzenlemek için giriş yapmalısınız");
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
        "İlan yüklenemedi",
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
      ) => void)
    | null
  >(null);
  useEffect(() => {
    const edit = listingQuery.data?.edit;
    if (!edit) return;
    if (populatedForRef.current === id) {
      if (formState.isDirty) return;
    }
    populatedForRef.current = id;

    const { newFormData } = buildListingFormData(edit);
    reset(toValues(newFormData));
    // Kayıtlı görseller `uploaded` olarak yerleşir; yeniden YÜKLENMEZ.
    seedExistingImagesRef.current?.(edit.images ?? []);

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
      toast.success("İlanınız güncellendi!");
      queryClient.invalidateQueries({ queryKey: queryKeys.product.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.listings.all() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.profileListings.all(),
      });
      router.push(`/listings/${id}`);
    },
    onError: (error: any) =>
      toast.error(error.response?.data?.message || "İlan güncellenemedi"),
    onSettled: () => setIsLoading(false),
  });

  const onSubmit = (values: EditListingValues) => {
    const formPrice = Number(values.price);

    const payload: Record<string, unknown> = {
      title: values.title,
      description: values.description || undefined,
      price: formPrice,
      categoryId: values.categoryId,
      condition: values.condition,
      brandId: values.brandId || undefined,
      carModelId: values.carModelId || undefined,
      modelCode: values.modelCode,
      color: values.color,
      scale: values.scale || undefined,
      material: values.material || undefined,
      manufacturerId: values.manufacturerId || undefined,
      isBoxed: values.isBoxed === "boxed",
      year: values.year ? Number(values.year) : undefined,
      isTradeEnabled: values.isTradeEnabled,
      isSet: values.isSet,
      bundleSize:
        values.isSet && Number(values.bundleSize) >= 2
          ? Number(values.bundleSize)
          : null,
      quantity:
        values.quantity && values.quantity !== ""
          ? Number(values.quantity)
          : null,
      shippingPackageTier: values.shippingPackageTier,
      images: values.images.length > 0 ? values.images : undefined,
      status: values.status,
      // Üreticiye özel nitelikler — sunucu önceki seçimleri temizleyip bunları
      // yazar, yani boş dizi "seçim yok" demektir.
      attributes: Object.values(values.customAttributes ?? {})
        .flat()
        .filter(Boolean),
    };
    Object.assign(payload, saleDataToPayload(saleData, formPrice));

    updateMutation.mutate(payload);
  };

  return {
    form,
    onSubmit,
    /** Kaydın kendisi — bağlı listeleri slug'la hemen açabilmek için. */
    record: listingQuery.data?.edit ?? null,
    saleData,
    setSaleData,
    seedExistingImagesRef,
    showDiscountSection,
    setShowDiscountSection,
    isLoading,
    setIsLoading,
    isFetching,
  };
}
