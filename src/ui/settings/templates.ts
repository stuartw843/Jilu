import { elements } from "../../dom";
import { getDefaultTemplateId, setDefaultTemplateId } from "../../prompt-templates";
import { loadTemplateOptions } from "../template-manager";

export function loadDefaultTemplate(): void {
  if (!elements.defaultTemplateSelect) return;

  loadTemplateOptions(elements.defaultTemplateSelect);
  const defaultId = getDefaultTemplateId();
  elements.defaultTemplateSelect.value = defaultId;
}

export function saveDefaultTemplateSelection(): void {
  const defaultTemplate = elements.defaultTemplateSelect?.value;
  if (defaultTemplate) {
    setDefaultTemplateId(defaultTemplate);
  }
}
