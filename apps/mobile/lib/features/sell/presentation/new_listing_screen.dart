import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/api/api_client.dart';
import '../../vehicles/domain/vehicle.dart';
import '../data/listing_repository.dart';
import 'sell_vehicle_screen.dart';

class NewListingScreen extends StatefulWidget {
  const NewListingScreen({super.key, this.draft, this.dealerMode = false});
  final Vehicle? draft;
  final bool dealerMode;

  @override
  State<NewListingScreen> createState() => _NewListingScreenState();
}

class _NewListingScreenState extends State<NewListingScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _repository =
      ListingRepository(ApiClient(), dealerMode: widget.dealerMode);
  final _picker = ImagePicker();
  final _make = TextEditingController();
  final _model = TextEditingController();
  final _year = TextEditingController(text: DateTime.now().year.toString());
  final _price = TextEditingController();
  final _mileage = TextEditingController();
  final _address = TextEditingController();

  List<City> _cities = [];
  List<XFile> _images = [];
  String? _cityId;
  String? _draftId;
  String _category = 'Car';
  String _condition = 'Used';
  String _saleType = 'FixedPrice';
  bool _uploaded = false;
  bool _busy = false;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    final draft = widget.draft;
    if (draft != null) {
      _draftId = draft.id;
      _uploaded = draft.images.isNotEmpty;
      _make.text = draft.make;
      _model.text = draft.model;
      _year.text = draft.year.toString();
      _price.text = draft.priceLyd?.toString() ?? '';
      _category = draft.category;
      _saleType = draft.saleType;
    }
    _loadCities();
  }

  Future<void> _loadCities() async {
    try {
      final cities = await _repository.cities();
      if (!mounted) return;
      setState(() {
        _cities = cities;
        _cityId = cities.isEmpty ? null : cities.first.id;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'تعذر تحميل المدن. تحقق من الاتصال.';
          _loading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    for (final controller in [
      _make,
      _model,
      _year,
      _price,
      _mileage,
      _address
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('عرض مركبة')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 24),
                children: [
                  if (widget.draft == null && !widget.dealerMode) ...[
                    const Text('نوع العرض',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 16)),
                    const SizedBox(height: 8),
                    const Text(
                        'بيع مباشر بمراجعة الإدارة، أو طلب إدخال في المزاد.',
                        style:
                            TextStyle(color: Color(0xFF65758B), fontSize: 12)),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => const SellVehicleScreen())),
                      icon: const Icon(Icons.gavel_outlined),
                      label: const Text('أضف للمزاد بدل البيع المباشر'),
                    ),
                    const Divider(height: 34),
                  ],
                  const Text('بيع مباشر',
                      style:
                          TextStyle(fontWeight: FontWeight.w800, fontSize: 20)),
                  const SizedBox(height: 12),
                  if (widget.draft != null)
                    Text('إكمال مسودة ${widget.draft!.lotNumber}',
                        style: const TextStyle(color: Color(0xFF1769D2))),
                  if (widget.draft == null) ...[
                    DropdownButtonFormField<String>(
                      initialValue: _category,
                      decoration: const InputDecoration(
                          labelText: 'التصنيف', border: OutlineInputBorder()),
                      items: vehicleCategoryLabels.entries
                          .map((entry) => DropdownMenuItem(
                              value: entry.key, child: Text(entry.value)))
                          .toList(),
                      onChanged: (value) => setState(() => _category = value!),
                    ),
                    const SizedBox(height: 12),
                    _field(_make, 'العلامة أو الشركة', required: true),
                    _field(_model, 'اسم المركبة أو الموديل', required: true),
                    _field(_year, 'سنة الصنع', required: true, number: true),
                    DropdownButtonFormField<String>(
                      initialValue: _cityId,
                      key: ValueKey(_cityId),
                      decoration: const InputDecoration(
                          labelText: 'المدينة', border: OutlineInputBorder()),
                      items: _cities
                          .map((city) => DropdownMenuItem(
                              value: city.id, child: Text(city.nameAr)))
                          .toList(),
                      onChanged: (value) => setState(() => _cityId = value),
                      validator: (value) =>
                          value == null ? 'اختر المدينة' : null,
                    ),
                    const SizedBox(height: 12),
                    _field(_price, 'السعر بالدينار الليبي',
                        required: true, number: true),
                    DropdownButtonFormField<String>(
                      initialValue: _saleType,
                      decoration: const InputDecoration(
                          labelText: 'طريقة البيع',
                          border: OutlineInputBorder()),
                      items: const [
                        DropdownMenuItem(
                            value: 'FixedPrice', child: Text('سعر ثابت')),
                        DropdownMenuItem(
                            value: 'Negotiable', child: Text('قابل للتفاوض')),
                        DropdownMenuItem(
                            value: 'QuickSale', child: Text('بيع سريع')),
                      ],
                      onChanged: (value) => setState(() => _saleType = value!),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: _condition,
                      decoration: const InputDecoration(
                          labelText: 'الحالة', border: OutlineInputBorder()),
                      items: const [
                        DropdownMenuItem(value: 'Used', child: Text('مستعملة')),
                        DropdownMenuItem(value: 'New', child: Text('جديدة')),
                        DropdownMenuItem(
                            value: 'Excellent', child: Text('ممتازة')),
                        DropdownMenuItem(
                            value: 'Accident', child: Text('تعرضت لحادث')),
                        DropdownMenuItem(
                            value: 'NeedsRepair', child: Text('تحتاج إصلاح')),
                      ],
                      onChanged: (value) => setState(() => _condition = value!),
                    ),
                    const SizedBox(height: 12),
                    _field(_mileage, 'العداد بالكيلومتر (اختياري)',
                        number: true),
                    _field(_address, 'مكان المعاينة (اختياري)'),
                  ],
                  const SizedBox(height: 10),
                  Row(children: [
                    const Expanded(
                        child: Text('صور المركبة',
                            style: TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 16))),
                    OutlinedButton.icon(
                      onPressed:
                          _images.length >= 12 || _busy ? null : _pickImages,
                      icon: const Icon(Icons.add_photo_alternate_outlined),
                      label: const Text('إضافة صور'),
                    ),
                  ]),
                  Text(
                      widget.draft?.images.isNotEmpty == true
                          ? 'صور محفوظة: ${widget.draft!.images.length} · يمكنك إضافة صور'
                          : 'صورة واحدة على الأقل، حتى 12 صورة',
                      style: const TextStyle(
                          color: Color(0xFF65758B), fontSize: 12)),
                  if (_images.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    SizedBox(
                        height: 95,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: _images.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 8),
                          itemBuilder: (context, index) => Stack(children: [
                            ClipRRect(
                                borderRadius: BorderRadius.circular(5),
                                child: Image.file(File(_images[index].path),
                                    width: 105, height: 95, fit: BoxFit.cover)),
                            Positioned(
                                top: 2,
                                left: 2,
                                child: IconButton.filledTonal(
                                  onPressed: () =>
                                      setState(() => _images.removeAt(index)),
                                  icon: const Icon(Icons.close, size: 16),
                                  tooltip: 'حذف الصورة',
                                )),
                          ]),
                        )),
                  ],
                  if (_error != null)
                    Padding(
                        padding: const EdgeInsets.only(top: 14),
                        child: Text(_error!,
                            style: const TextStyle(color: Color(0xFFB42318)))),
                  const SizedBox(height: 22),
                  FilledButton.icon(
                    onPressed: _busy ? null : _submit,
                    icon: _busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2))
                        : const Icon(Icons.send_outlined),
                    label: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 13),
                        child:
                            Text(_busy ? 'جارٍ الإرسال...' : 'إرسال للمراجعة')),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                      'بعد إرسال الطلب يظهر في حسابك بحالة «بانتظار المراجعة». يظهر للآخرين بعد موافقة الإدارة.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFF65758B), fontSize: 12)),
                ],
              ),
            ),
    );
  }

  Widget _field(TextEditingController controller, String label,
          {bool required = false, bool number = false}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: controller,
          keyboardType: number
              ? const TextInputType.numberWithOptions(decimal: true)
              : TextInputType.text,
          textDirection: number ? TextDirection.ltr : null,
          decoration: InputDecoration(
              labelText: label, border: const OutlineInputBorder()),
          validator: (value) =>
              required && (value == null || value.trim().isEmpty)
                  ? 'هذا الحقل مطلوب'
                  : null,
        ),
      );

  Future<void> _pickImages() async {
    final selected =
        await _picker.pickMultiImage(imageQuality: 82, maxWidth: 2200);
    if (selected.isEmpty || !mounted) return;
    final paths = _images.map((item) => item.path).toSet();
    setState(() => _images = [
          ..._images,
          ...selected.where((item) => paths.add(item.path))
        ].take(12).toList());
  }

  String _errorText(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      final message = data is Map<String, dynamic> ? data['message'] : null;
      if (message == 'listing.image_required') {
        return 'أضف صورة واحدة على الأقل.';
      }
      if (message == 'city.invalid') return 'اختر مدينة متاحة.';
      if (error.response?.statusCode == 401) {
        return 'انتهت الجلسة، سجّل الدخول مجددًا.';
      }
      if (message is List) return message.join('، ');
      if (message is String) return message;
    }
    return 'تعذر إرسال الإعلان. تحقق من الاتصال وحاول مجددًا. المسودة محفوظة في حسابك.';
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (widget.draft == null && !_formKey.currentState!.validate()) return;
    if (!_uploaded && _images.isEmpty) {
      setState(() => _error = 'أضف صورة واحدة على الأقل.');
      return;
    }
    final year = int.tryParse(_year.text.trim());
    final price = double.tryParse(_price.text.trim());
    if (widget.draft == null &&
        (year == null ||
            year < 1950 ||
            year > DateTime.now().year + 1 ||
            price == null ||
            price <= 0)) {
      setState(() => _error = 'تحقق من سنة الصنع والسعر.');
      return;
    }
    setState(() => _busy = true);
    try {
      if (_draftId == null) {
        final vehicle = await _repository.create({
          'category': _category,
          'make': _make.text.trim(),
          'model': _model.text.trim(),
          'year': year,
          'cityId': _cityId,
          'priceLyd': price,
          'saleType': _saleType,
          'condition': _condition,
          if (int.tryParse(_mileage.text.trim()) != null)
            'mileageKm': int.parse(_mileage.text.trim()),
          if (_address.text.trim().isNotEmpty) 'address': _address.text.trim(),
        });
        _draftId = vehicle.id;
      }
      if (_images.isNotEmpty) {
        await _repository.uploadImages(_draftId!, _images);
        _uploaded = true;
        _images = [];
      }
      await _repository.submit(_draftId!);
      if (!mounted) return;
      await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
                icon: const Icon(Icons.check_circle_outline,
                    color: Color(0xFF138A52)),
                title: const Text('تم إرسال المركبة للمراجعة'),
                content: const Text(
                    'ستظهر في «إعلاناتي» بحالة بانتظار المراجعة، وبعد اعتمادها تظهر في نتائج البحث.'),
                actions: [
                  FilledButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('تم'))
                ],
              ));
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = _errorText(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
