import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      expand={false}
      duration={3000}
    />
  );
}

