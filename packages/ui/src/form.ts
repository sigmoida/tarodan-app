// Form layer — react-hook-form + zod primitives.
//
// Exposed as a subpath (`@tarodan/ui/form`) rather than from the package root
// so that only screens that actually build forms pull `react-hook-form`, `zod`,
// and `@hookform/resolvers` into their bundle. Everything else importing
// `@tarodan/ui` stays form-free.
export {
  Form,
  FormInput,
  FormError,
  type FormInputProps,
} from "./components/form/Form";
export { FormSelect, type FormSelectProps } from "./components/form/FormSelect";
export {
  FormSearchableSelect,
  type FormSearchableSelectProps,
} from "./components/form/FormSearchableSelect";
export { FormPhone, type FormPhoneProps } from "./components/form/FormPhone";
export { FormIban, type FormIbanProps } from "./components/form/FormIban";
export {
  FormTextarea,
  type FormTextareaProps,
} from "./components/form/FormTextarea";
export {
  FormCheckbox,
  type FormCheckboxProps,
} from "./components/form/FormCheckbox";
export {
  FormImageUpload,
  type FormImageUploadProps,
} from "./components/form/FormImageUpload";
export { FormModal, type FormModalProps } from "./components/form/FormModal";
export {
  useConfirm,
  type ConfirmFn,
  type ConfirmOptions,
} from "./components/ConfirmProvider";
export { useZodForm } from "./lib/use-zod-form";
