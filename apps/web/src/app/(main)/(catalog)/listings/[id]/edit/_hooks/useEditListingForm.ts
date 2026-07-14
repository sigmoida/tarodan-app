import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useZodForm } from "@tarodan/ui/form";
import { listingsApi, userApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import { createInitialSaleData } from "../_lib/constants";
import {
  buildListingFormData,
  buildSaleDataFromListing,
} from "../_lib/build-edit-form-data";
import {
  editListingSchema,
  emptyEditValues,
  type EditListingValues,
} from "../_lib/schema";
import type { EditListingFormData, SaleData } from "../_lib/types";

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
  const { reset, getValues } = form;

  // Shared submit/lifecycle busy flag (also driven by `useListingLifecycle`).
  const [isLoading, setIsLoading] = useState(false);
  // Store preview URLs separately (presigned URLs for display).
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [showDiscountSection, setShowDiscountSection] = useState(false);
  const [saleData, setSaleData] = useState<SaleData>(createInitialSaleData);

  // Auth gate.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      toast.error("İlan düzenlemek için giriş yapmalısınız");
      router.push("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Load the listing — own-product endpoint first (works for all statuses), then
  // the public endpoint if we're not the owner.
  const listingQuery = useQuery({
    queryKey: queryKeys.listingEdit.detail(id),
    queryFn: async () => {
      let response;
      try {
        response = await userApi.getMyProductById(id);
      } catch (myProductError: any) {
        if (
          myProductError.response?.status === 404 ||
          myProductError.response?.status === 403
        ) {
          response = await listingsApi.getOne(id);
        } else {
          throw myProductError;
        }
      }
      return response.data.product || response.data;
    },
    enabled: !authLoading && isAuthenticated && !!id,
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

  // Populate the form from the fetched listing — once, when the data arrives.
  const populatedRef = useRef(false);
  useEffect(() => {
    const listing = listingQuery.data;
    if (!listing || populatedRef.current) return;
    populatedRef.current = true;

    const prev = getValues() as unknown as EditListingFormData;
    const { newFormData, previewUrls } = buildListingFormData(prev, listing);
    reset(toValues(newFormData));
    setImagePreviewUrls(previewUrls);

    const { saleData: nextSaleData, saleActive } =
      buildSaleDataFromListing(listing);
    setSaleData(nextSaleData);
    if (saleActive) setShowDiscountSection(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingQuery.data]);

  const isFetching = !id ? false : authLoading || listingQuery.isPending;

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
    const orig = saleData.originalPrice
      ? Number(saleData.originalPrice)
      : formPrice;
    const sale = saleData.salePrice ? Number(saleData.salePrice) : 0;
    const effectiveOrig = Math.max(orig, formPrice);
    const hasSale = sale > 0 && effectiveOrig > sale && sale !== formPrice;

    const payload: Record<string, unknown> = {
      title: values.title,
      description: values.description || undefined,
      price: formPrice,
      categoryId: values.categoryId,
      condition: values.condition,
      brandId: values.brandId || undefined,
      carModelId: values.carModelId || undefined,
      scale: values.scale || undefined,
      material: values.material || undefined,
      manufacturerId: values.manufacturerId || undefined,
      year: values.year ? Number(values.year) : undefined,
      isTradeEnabled: values.isTradeEnabled,
      isPreorder: values.isPreorder,
      isSet: values.isSet,
      bundleSize:
        values.isSet && Number(values.bundleSize) >= 2
          ? Number(values.bundleSize)
          : null,
      quantity:
        values.quantity && values.quantity !== ""
          ? Number(values.quantity)
          : null,
      images: values.images.length > 0 ? values.images : undefined,
      status: values.status,
    };
    if (hasSale) {
      payload.originalPrice = effectiveOrig;
      payload.salePrice = sale;
      payload.saleStartDate = saleData.saleStartDate
        ? new Date(saleData.saleStartDate).toISOString()
        : null;
      payload.saleEndDate = saleData.saleEndDate
        ? new Date(saleData.saleEndDate).toISOString()
        : null;
    } else {
      payload.originalPrice = null;
      payload.salePrice = null;
      payload.saleStartDate = null;
      payload.saleEndDate = null;
    }

    updateMutation.mutate(payload);
  };

  return {
    form,
    onSubmit,
    saleData,
    setSaleData,
    imagePreviewUrls,
    setImagePreviewUrls,
    showDiscountSection,
    setShowDiscountSection,
    isLoading,
    setIsLoading,
    isFetching,
  };
}
