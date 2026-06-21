import { useEffect, useState } from "react";
import { getStoredLanguage, LANGUAGE_CHANGED_EVENT, translateText } from "./translations";

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "aria-label", "title"];

function translateElementAttributes(element, language) {
  TRANSLATABLE_ATTRIBUTES.forEach((attribute) => {
    if (!element.hasAttribute(attribute)) {
      return;
    }

    const originalKey = `original${attribute.replace(/(^|-)([a-z])/g, (_, __, char) => char.toUpperCase())}`;
    if (!element.dataset[originalKey]) {
      element.dataset[originalKey] = element.getAttribute(attribute);
    }

    const originalValue = element.dataset[originalKey];
    const translated = translateText(originalValue, language);
    if (element.getAttribute(attribute) !== translated) {
      element.setAttribute(attribute, translated);
    }
  });
}

function translateTextNode(node, language) {
  if (!node.nodeValue || !node.nodeValue.trim()) {
    return;
  }

  if (!node.__imperialOriginalText) {
    node.__imperialOriginalText = node.nodeValue;
  }

  const originalText = node.__imperialOriginalText;
  const leadingSpace = originalText.match(/^\s*/)?.[0] || "";
  const trailingSpace = originalText.match(/\s*$/)?.[0] || "";
  const translated = translateText(originalText.trim(), language);

  const nextValue = `${leadingSpace}${translated}${trailingSpace}`;
  if (node.nodeValue !== nextValue) {
    node.nodeValue = nextValue;
  }
}

function applyTranslations(language) {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const textNodes = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach((node) => translateTextNode(node, language));
  document.querySelectorAll("[placeholder], [aria-label], [title]").forEach((element) => {
    translateElementAttributes(element, language);
  });
}

export default function TranslationManager() {
  const [language, setLanguage] = useState(getStoredLanguage);

  useEffect(() => {
    const handleLanguageChanged = (event) => {
      setLanguage(event.detail?.language || getStoredLanguage());
    };

    window.addEventListener(LANGUAGE_CHANGED_EVENT, handleLanguageChanged);
    window.addEventListener("storage", handleLanguageChanged);

    return () => {
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, handleLanguageChanged);
      window.removeEventListener("storage", handleLanguageChanged);
    };
  }, []);

  useEffect(() => {
    applyTranslations(language);
    document.documentElement.lang = language;

    const observer = new MutationObserver(() => {
      applyTranslations(language);
    });

    observer.observe(document.body, {
      attributes: true,
      childList: true,
      characterData: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [language]);

  return null;
}
