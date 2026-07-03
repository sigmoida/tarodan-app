// Form layer — react-hook-form + zod primitives.
//
// Exposed as a subpath (`@tarodan/ui/form`) rather than from the package root
// so that only screens that actually build forms pull `react-hook-form`, `zod`,
// and `@hookform/resolvers` into their bundle. Everything else importing
// `@tarodan/ui` stays form-free.
export { Form, FormInput, FormError, type FormInputProps } from './components/form/Form';
export { useZodForm } from './lib/use-zod-form';
