import Image from "next/image";
import { useTranslations } from "next-intl";
import StatusScreen from "../_components/StatusScreen";
import SocialLinks from "../_components/SocialLinks";
import PinForm from "./_components/PinForm";

export default function ComingSoonPage() {
  const t = useTranslations();

  return (
    <StatusScreen
      logo={
        <Image
          src="/tarodan-logo.jpg"
          alt="Tarodan"
          width={162}
          height={40}
          className="rounded-lg object-contain"
          priority
        />
      }
      title={t("utility.comingSoon.title")}
      description={t("utility.comingSoon.subtitle")}
    >
      <p className="mb-8 text-sm font-medium text-primary-700">
        {t("utility.comingSoon.launchNote")}
      </p>

      <PinForm />

      <SocialLinks title={t("utility.comingSoon.socialTitle")} />
    </StatusScreen>
  );
}
