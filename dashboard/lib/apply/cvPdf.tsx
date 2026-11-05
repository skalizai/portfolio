import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { TailoredCv } from "@/lib/apply/cvSchema";

// Automatic hyphenation mangles technical terms, such as turning OData into "ODa-ta".
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.4, color: "#14141f" },
  name: { fontFamily: "Helvetica-Bold", fontSize: 18, lineHeight: 1.2 },
  headline: { fontSize: 12, marginTop: 6 },
  contact: { fontSize: 9, marginTop: 4, color: "#55586a" },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 14, marginBottom: 4, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: "#c8c9d4" },
  roleTitle: { fontFamily: "Helvetica-Bold", marginTop: 6 },
  roleMeta: { color: "#55586a", marginBottom: 2 },
  bullet: { flexDirection: "row", marginTop: 1 },
  dot: { width: 10 },
  text: { flex: 1 },
});

/** The built-in PDF fonts only cover Western European characters, so others are simplified. */
const printable = (text: string) =>
  text
    .replace(/[▸►▪●◦·]/g, "")
    .replace(/[^\u0009\u000a\u000d -~ -ÿ–—‘’“”•€]/g, "")
    .trim();

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((item, index) => (
        <View key={index} style={styles.bullet}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.text}>{printable(item)}</Text>
        </View>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.heading} minPresenceAhead={30}>
        {printable(title)}
      </Text>
      {children}
    </View>
  );
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" });

/** The cover letter as a one-page document to attach to your email. */
export function renderLetterPdf(letter: string, cv: Pick<TailoredCv, "name" | "contact">, date: Date): Promise<Buffer> {
  const paragraphs = letter.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  return renderToBuffer(
    <Document title={`Cover Letter - ${printable(cv.name)}`} author={printable(cv.name)}>
      <Page size="A4" style={{ ...styles.page, fontSize: 11, padding: 50 }}>
        <Text style={styles.name}>{printable(cv.name)}</Text>
        <Text style={styles.contact}>{cv.contact.map(printable).join("  |  ")}</Text>
        <Text style={{ marginTop: 24, marginBottom: 14 }}>{dateFormat.format(date)}</Text>
        {paragraphs.map((paragraph, index) => (
          <Text key={index} style={{ marginBottom: 10 }}>
            {printable(paragraph)}
          </Text>
        ))}
      </Page>
    </Document>,
  );
}

export function renderCvPdf(cv: TailoredCv): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`CV - ${printable(cv.name)}`} author={printable(cv.name)}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{printable(cv.name)}</Text>
        <Text style={styles.headline}>{printable(cv.headline)}</Text>
        <Text style={styles.contact}>{cv.contact.map(printable).join("  |  ")}</Text>

        <Section title="Professional Summary">
          <Text>{printable(cv.summary)}</Text>
        </Section>

        {cv.competencies.length > 0 && (
          <Section title="Core Competencies">
            <Bullets items={cv.competencies} />
          </Section>
        )}

        {cv.experience.length > 0 && (
          <Section title="Professional Experience">
            {cv.experience.map((role, index) => (
              <View key={index}>
                <Text style={styles.roleTitle} minPresenceAhead={30}>
                  {printable(role.role)}
                </Text>
                <Text style={styles.roleMeta}>{[role.company, role.location, role.dates].map(printable).filter(Boolean).join("  |  ")}</Text>
                <Bullets items={role.bullets} />
              </View>
            ))}
          </Section>
        )}

        {cv.education.length > 0 && (
          <Section title="Education">
            <Bullets items={cv.education} />
          </Section>
        )}

        {cv.certifications.length > 0 && (
          <Section title="Certifications">
            <Bullets items={cv.certifications} />
          </Section>
        )}

        {cv.other.map((section, index) => (
          <Section key={index} title={section.title}>
            <Bullets items={section.items} />
          </Section>
        ))}
      </Page>
    </Document>,
  );
}
