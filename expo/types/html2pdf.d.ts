declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    enableLinks?: boolean;
    html2canvas?: Record<string, any>;
    jsPDF?: Record<string, any>;
    pagebreak?: { mode?: string | string[]; before?: string[]; after?: string[]; avoid?: string[] };
  }

  interface Html2PdfWorker {
    set(opt: Html2PdfOptions): Html2PdfWorker;
    from(element: HTMLElement | string, type?: string): Html2PdfWorker;
    save(filename?: string): Promise<void>;
    toPdf(): Html2PdfWorker;
    output(type?: string, options?: any): Promise<any>;
    then(onFulfilled?: (value: any) => any, onRejected?: (reason: any) => any): Promise<any>;
  }

  function html2pdf(): Html2PdfWorker;
  function html2pdf(element: HTMLElement | string, opt?: Html2PdfOptions): Html2PdfWorker;

  export default html2pdf;
}
