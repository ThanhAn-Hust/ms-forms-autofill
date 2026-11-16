# MS Forms PDF Autofill Extension

Tiện ích Chrome / Microsoft Edge (Manifest V3) giúp đọc file **PDF A** (bản in *Save my response* từ Microsoft Forms) hoàn toàn **trực tiếp ngay trên trình duyệt** bằng `pdf.js` + `<canvas>`, trích xuất đáp án (trắc nghiệm 1 lựa chọn, nhiều lựa chọn và điền chữ) rồi tự động so khớp và điền vào **Form B** tương ứng — ngay cả khi Form B bị đảo thứ tự câu hỏi hoặc đảo thứ tự A/B/C/D.

## Tính năng chính
- **100% nội bộ trên trình duyệt:** Không cần server, không cần API key, không gửi dữ liệu ra ngoài.
- **Nhận diện chính xác bằng tọa độ + pixel `<canvas>`:** Phân tích trực tiếp ô tròn (radio) và ô vuông (checkbox) nằm bên trái mỗi lựa chọn để biết đáp án nào đã được chọn trong PDF A, kèm trích xuất đáp án các câu điền chữ.
- **Không phụ thuộc thứ tự câu hỏi/đáp án:** Chuẩn hóa tiếng Việt (NFC/NFD), loại bỏ số thứ tự câu và điểm số để đối chiếu theo nội dung chữ.
- **Xem trước & chỉnh sửa nhanh ngay trên Popup:** Sau khi nạp PDF A, bạn có thể xem lại toàn bộ danh sách câu hỏi, click đổi đáp án trắc nghiệm hoặc sửa đáp án điền chữ trước khi điền sang Form B.
- **Nút nổi tiện lợi trên trang Form (`⚡ Điền đáp án`):** Hỗ trợ tùy chọn tự động điền khi bấm *Next / Tiếp theo* sang trang mới của Microsoft Forms. Không bao giờ tự bấm *Submit / Gửi* để bạn kiểm tra lại trước khi nộp.

## Cách cài đặt vào Chrome / Edge
1. Mở trình duyệt Chrome hoặc Edge và truy cập `chrome://extensions` (hoặc `edge://extensions`).
2. Bật chế độ **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Nhấn **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn thư mục:
   `/home/la/.gemini/antigravity-cli/scratch/ms-forms-autofill/extension`

> **Lưu ý nếu thử trên file HTML local (`file://`):** Trong trang `chrome://extensions`, nhấn **Details** (Chi tiết) của extension *MS Forms PDF Autofill* và bật mục **Allow access to file URLs** (Cho phép truy cập vào các URL của tệp).

## Cách sử dụng
1. Mở file PDF A bằng cách click biểu tượng extension trên thanh công cụ trình duyệt, kéo thả hoặc chọn file PDF được in từ *Save my response* của Microsoft Forms.
2. Kiểm tra lại danh sách `Câu hỏi -> Đáp án` trên Popup (có thể bấm trực tiếp vào lựa chọn để sửa nếu muốn).
3. Mở **Form B** trên Microsoft Forms (`forms.office.com` hoặc `forms.cloud.microsoft`).
4. Nhấn **⚡ Điền ngay vào Form đang mở** trên Popup hoặc bấm nút nổi **⚡ Điền đáp án** ở góc dưới bên phải màn hình.
5. Kiểm tra lại các câu đã được tô viền xanh (đã điền) / viền vàng (chưa khớp hoặc chưa có đáp án) rồi tự bấm **Submit**.

## Thử nhanh với dữ liệu mẫu đi kèm
Trong thư mục `demo/` có sẵn 2 file để kiểm thử ngay lập tức:
- File PDF A mẫu (5 câu gồm trắc nghiệm 1 chọn, nhiều chọn và điền chữ): `demo/sample-response-A.pdf`
- Trang Form B giả lập (đã đảo thứ tự cả 5 câu và đảo vị trí các lựa chọn): `demo/mock-ms-form.html`

## Chạy bộ kiểm thử tự động (Unit & E2E Tests)
```bash
npm test
```
