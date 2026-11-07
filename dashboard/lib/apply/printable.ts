/** The built-in PDF fonts only cover Western European characters, so others are simplified. */
export const printable = (text: string) =>
  text
    .replace(/\s*[→⇒➔➜]\s*/g, " to ")
    .replace(/\s*[↔⇔]\s*/g, " and ")
    .replace(/[▸►▪●◦·]/g, "")
    .replace(/[^\u0009\u000a\u000d\u0020-\u007e\u00a0-\u00ff–—‘’“”•€]/g, "")
    .trim();
