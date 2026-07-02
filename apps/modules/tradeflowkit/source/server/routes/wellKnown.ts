import { Router, type Request, type Response } from "express";

const router = Router();

router.get("/.well-known/assetlinks.json", (_req: Request, res: Response) => {
  const assetlinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.tradeflowkit.app",
        sha256_cert_fingerprints: [
          "63:1A:1C:D8:F0:7E:D0:D4:8B:8F:BF:3F:36:0B:63:1C:90:92:35:1E:F2:13:84:62:B9:D0:0E:31:24:06:81:50",
          "F0:21:04:1C:12:B5:9D:D2:E9:F1:55:78:D2:62:D1:DE:E8:51:F5:88:B2:83:01:51:B9:D5:FA:AD:AF:05:87:EB",
          "F7:F0:FF:1C:12:58:71:E2:FF:41:AA:1C:42:68:B4:9D:A4:67:BB:14:6A:6B:31:B5:95:AC:88:82:36:A4:0F:38",
        ],
      },
    },
  ];
  res.setHeader("Content-Type", "application/json");
  res.json(assetlinks);
});

export default router;
