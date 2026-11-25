import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { printable } from "@/lib/apply/printable";
import { hasCnic, longDate, PAYSLIP_TEXT, type PayslipLanguage, type PayslipSnapshot, payslipNumber, periodLabel, rupees } from "@/lib/household/payslip";

// Automatic hyphenation splits names and labels oddly, so it's off.
Font.registerHyphenationCallback((word) => [word]);

const ink = "#14141f";
const dim = "#55586a";
const rule = "#c8c9d4";

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.4, color: ink },
  head: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: ink, paddingBottom: 10 },
  employer: { fontFamily: "Helvetica-Bold", fontSize: 15 },
  small: { fontSize: 9, color: dim },
  title: { fontFamily: "Helvetica-Bold", fontSize: 13, textAlign: "right" },
  grid: { flexDirection: "row", marginTop: 14, gap: 16 },
  box: { flex: 1, borderWidth: 1, borderColor: rule, borderRadius: 4, padding: 10 },
  label: { fontSize: 8, color: dim, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { marginBottom: 4 },
  heading: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: rule },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  rowLabel: { flex: 1, paddingRight: 8 },
  total: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: rule, fontFamily: "Helvetica-Bold" },
  net: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, padding: 12, borderWidth: 2, borderColor: ink, borderRadius: 4 },
  netText: { fontFamily: "Helvetica-Bold", fontSize: 14 },
  signatures: { flexDirection: "row", gap: 40, marginTop: 56 },
  signature: { flex: 1, borderTopWidth: 1, borderTopColor: ink, paddingTop: 4 },
});

function Amounts({ title, rows, total, totalLabel, empty }: { title: string; rows: { label: string; amount: string }[]; total: string; totalLabel: string; empty: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>{title}</Text>
      {rows.length ? (
        rows.map((row, i) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rowLabel}>{printable(row.label)}</Text>
            <Text>{rupees(row.amount)}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.small}>{empty}</Text>
      )}
      <View style={styles.total}>
        <Text>{totalLabel}</Text>
        <Text>{rupees(total)}</Text>
      </View>
    </View>
  );
}

/** One payslip as an A4 PDF, with signature lines for you and for the employee. */
export function renderPayslipPdf(id: string, s: PayslipSnapshot, language: PayslipLanguage = "en"): Promise<Buffer> {
  const t = PAYSLIP_TEXT[language];
  return renderToBuffer(
    <Document title={`${t.title} ${s.month} ${printable(s.employee.name)}`} author={printable(s.employer.name)}>
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.employer}>{printable(s.employer.name)}</Text>
            {s.employer.address ? <Text style={styles.small}>{printable(s.employer.address)}</Text> : null}
          </View>
          <View>
            <Text style={styles.title}>{t.title}</Text>
            <Text style={[styles.small, { textAlign: "right" }]}>
              {t.period}: {periodLabel(s.month)}
            </Text>
            <Text style={[styles.small, { textAlign: "right" }]}>
              {t.payslipNo}: {payslipNumber(id, s.month)}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.box}>
            <Text style={styles.label}>{t.employee}</Text>
            <Text style={[styles.value, { fontFamily: "Helvetica-Bold" }]}>{printable(s.employee.name)}</Text>
            <Text style={styles.label}>{t.role}</Text>
            <Text style={styles.value}>{printable(s.employee.role)}</Text>
            <Text style={styles.label}>{hasCnic(s) ? `${t.cnic} · ${t.joined}` : t.joined}</Text>
            <Text>{hasCnic(s) ? `${s.employee.cnic} · ${longDate(s.employee.joiningDate)}` : longDate(s.employee.joiningDate)}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.label}>{t.paidOn}</Text>
            <Text style={styles.value}>{longDate(s.payment.date)}</Text>
            <Text style={styles.label}>{t.paidBy}</Text>
            <Text style={styles.value}>{s.payment.method}</Text>
            {s.payment.reference ? (
              <>
                <Text style={styles.label}>{t.reference}</Text>
                <Text>{printable(s.payment.reference)}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.grid}>
          <Amounts title={t.earnings} rows={s.earnings} total={s.gross} totalLabel={t.gross} empty="" />
          <Amounts title={t.deductions} rows={s.deductions} total={s.totalDeductions} totalLabel={t.totalDeductions} empty={t.noDeductions} />
        </View>

        <View style={styles.net}>
          <Text style={styles.netText}>{t.net}</Text>
          <Text style={styles.netText}>{rupees(s.net)}</Text>
        </View>
        <View style={[styles.row, { marginTop: 8 }]}>
          <Text style={styles.small}>{t.advanceBalance}</Text>
          <Text style={styles.small}>{rupees(s.advanceOutstanding)}</Text>
        </View>
        <Text style={[styles.small, { marginTop: 4 }]}>{t.amountsIn}</Text>

        <View style={styles.signatures}>
          <View style={styles.signature}>
            <Text>{t.employerSignature}</Text>
            <Text style={styles.small}>{t.date}:</Text>
          </View>
          <View style={styles.signature}>
            <Text>{t.receivedBy}</Text>
            <Text style={styles.small}>{t.date}:</Text>
          </View>
        </View>
      </Page>
    </Document>,
  );
}
