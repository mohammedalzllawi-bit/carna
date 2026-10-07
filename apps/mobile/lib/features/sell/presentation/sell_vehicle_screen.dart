import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../../core/api/api_client.dart';
import '../../vehicles/domain/vehicle.dart';
import '../data/sell_vehicle_repository.dart';
import '../../account/presentation/profile_tools_screen.dart';
import '../../account/presentation/wallet_screen.dart';

class SellVehicleScreen extends StatefulWidget {
  const SellVehicleScreen({super.key});

  @override
  State<SellVehicleScreen> createState() => _SellVehicleScreenState();
}

class _SellVehicleScreenState extends State<SellVehicleScreen> {
  int minimumImages = 4;
  static const maximumImages = 24;
  bool subscriptionRequired = true;
  final _api = ApiClient();

  final _formKey = GlobalKey<FormState>();
  final _repository = SellVehicleRepository(ApiClient());
  final _picker = ImagePicker();
  final _controllers = <String, TextEditingController>{
    for (final key in [
      'make',
      'model',
      'trim',
      'year',
      'mileageKm',
      'exteriorColor',
      'interiorColor',
      'engineCapacityCc',
      'cylinders',
      'doors',
      'seats',
      'bodyType',
      'address',
      'startingPriceLyd',
      'description',
      'bidIncrementLyd',
      'reservePriceLyd',
      'registrationStatus',
      'ownershipStatus'
    ])
      key: TextEditingController(),
  };

  List<City> _cities = const [];
  List<XFile> _images = const [];
  String? _cityId;
  String _category = 'Car';
  String _condition = 'Used';
  String _fuelType = 'بنزين';
  String _transmission = 'أوتوماتيك';
  String _drivetrain = 'دفع أمامي';
  bool _loadingCities = true;
  bool _submitting = false;
  String? _error;
  late DateTime _startsAt;
  late DateTime _endsAt;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _startsAt = DateTime(now.year, now.month, now.day + 1, 20);
    _endsAt = _startsAt.add(const Duration(days: 3));
    _controllers['year']!.text = now.year.toString();
    _controllers['bidIncrementLyd']!.text = '100';
    _loadCities();
    _loadRules();
  }

  Future<void> _loadRules() async {
    try {
      final response =
          await _api.dio.get<Map<String, dynamic>>('/v1/settings/public');
      if (!mounted) return;
      final settings = response.data ?? {};
      setState(() {
        minimumImages =
            (settings['vehicle.minimum_listing_images'] as num? ?? 4).toInt();
        subscriptionRequired =
            settings['auction.publisher_subscription_required'] != false;
        _controllers['bidIncrementLyd']!.text =
            ((settings['auction.bid_increment_milli'] as num? ?? 100000) / 1000)
                .toString();
      });
    } catch (_) {}
  }

  @override
  void dispose() {
    _api.dio.close();
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _loadCities() async {
    try {
      final cities = await _repository.loadCities();
      if (!mounted) return;
      setState(() {
        _cities = cities;
        _cityId = cities.isEmpty ? null : cities.first.id;
        _loadingCities = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingCities = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('عرض مركبة للمزاد')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
          children: [
            _header(),
            if (subscriptionRequired)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.workspace_premium_outlined),
                title: const Text('النشر في المزاد يتطلب اشتراكاً فعّالاً'),
                trailing: IconButton(
                    tooltip: 'اشتراكات النشر',
                    icon: const Icon(Icons.arrow_back),
                    onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const ProfileToolsScreen(
                                mode: 'subscriptions')))),
              ),
            const SizedBox(height: 16),
            _section(
              icon: Icons.photo_library_outlined,
              title: 'صور المركبة',
              child: _imagePicker(),
            ),
            const SizedBox(height: 12),
            _section(
              icon: Icons.directions_car_outlined,
              title: 'البيانات الأساسية',
              child: Column(children: [
                _dropdown(
                  label: 'التصنيف *',
                  value: _category,
                  items: vehicleCategoryLabels,
                  onChanged: (value) => setState(() => _category = value!),
                ),
                _row(_field('make', 'الشركة *'), _field('model', 'الموديل *')),
                _row(_field('trim', 'الفئة'),
                    _numberField('year', 'سنة الصنع *', required: true)),
                _row(
                  _dropdown(
                    label: 'حالة السيارة *',
                    value: _condition,
                    items: const {
                      'Used': 'مستعملة',
                      'New': 'جديدة',
                      'Excellent': 'ممتازة',
                      'Accident': 'تعرضت لحادث',
                      'NeedsRepair': 'تحتاج إصلاح',
                      'Runs': 'تعمل',
                      'NotRunning': 'لا تعمل',
                    },
                    onChanged: (value) => setState(() => _condition = value!),
                  ),
                  _field('bodyType', 'نوع الهيكل'),
                ),
                _row(_field('exteriorColor', 'اللون الخارجي'),
                    _field('interiorColor', 'اللون الداخلي')),
                _numberField('mileageKm', 'المسافة المقطوعة (كم)'),
              ]),
            ),
            const SizedBox(height: 12),
            if (_category != 'Bicycle')
              _section(
                icon: Icons.settings_outlined,
                title: 'المواصفات الفنية',
                child: Column(children: [
                  _row(
                    _dropdown(
                      label: 'الوقود',
                      value: _fuelType,
                      items: const {
                        'بنزين': 'بنزين',
                        'ديزل': 'ديزل',
                        'كهرباء': 'كهرباء',
                        'هجين': 'هجين'
                      },
                      onChanged: (value) => setState(() => _fuelType = value!),
                    ),
                    _dropdown(
                      label: 'ناقل الحركة',
                      value: _transmission,
                      items: const {'أوتوماتيك': 'أوتوماتيك', 'يدوي': 'يدوي'},
                      onChanged: (value) =>
                          setState(() => _transmission = value!),
                    ),
                  ),
                  _dropdown(
                    label: 'نظام الدفع',
                    value: _drivetrain,
                    items: const {
                      'دفع أمامي': 'دفع أمامي',
                      'دفع خلفي': 'دفع خلفي',
                      'دفع رباعي': 'دفع رباعي'
                    },
                    onChanged: (value) => setState(() => _drivetrain = value!),
                  ),
                  _row(_numberField('engineCapacityCc', 'سعة المحرك CC'),
                      _numberField('cylinders', 'الأسطوانات')),
                  _row(_numberField('doors', 'عدد الأبواب'),
                      _numberField('seats', 'عدد المقاعد')),
                  _row(_field('registrationStatus', 'حالة التسجيل'),
                      _field('ownershipStatus', 'حالة الملكية')),
                ]),
              ),
            const SizedBox(height: 12),
            _section(
              icon: Icons.location_on_outlined,
              title: 'الموقع',
              child: Column(children: [
                DropdownButtonFormField<String>(
                  key: ValueKey(_cityId),
                  initialValue: _cityId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                      labelText: 'المدينة *', border: OutlineInputBorder()),
                  items: _cities
                      .map((city) => DropdownMenuItem(
                          value: city.id, child: Text(city.nameAr)))
                      .toList(),
                  onChanged: _loadingCities
                      ? null
                      : (value) => setState(() => _cityId = value),
                  validator: (value) => value == null ? 'اختر المدينة' : null,
                ),
                const SizedBox(height: 10),
                _field('address', 'العنوان أو مكان السيارة', maxLines: 2),
              ]),
            ),
            const SizedBox(height: 12),
            _section(
              icon: Icons.gavel_outlined,
              title: 'تفاصيل المزاد',
              child: Column(children: [
                _field('description', 'وصف المزاد',
                    maxLines: 4, maxLength: 2000),
                const SizedBox(height: 10),
                _numberField('startingPriceLyd', 'السعر الابتدائي (د.ل) *',
                    required: true, decimal: true),
                _row(
                  _numberField('bidIncrementLyd', 'أقل زيادة (د.ل)',
                      decimal: true),
                  _numberField('reservePriceLyd', 'السعر الاحتياطي',
                      decimal: true),
                ),
                _dateField('بداية المزاد', _startsAt,
                    (value) => setState(() => _startsAt = value)),
                const SizedBox(height: 10),
                _dateField('نهاية المزاد', _endsAt,
                    (value) => setState(() => _endsAt = value)),
              ]),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 14),
                child: Text(_error!,
                    style: const TextStyle(
                        color: Color(0xFFB42318), fontWeight: FontWeight.w600)),
              ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox(
                    width: 19,
                    height: 19,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send_outlined),
            label: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: Text(_submitting
                  ? 'جاري رفع البيانات والصور...'
                  : 'إرسال للمراجعة'),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: const Color(0xFFEAF2FD),
            borderRadius: BorderRadius.circular(6)),
        child: const Row(children: [
          Icon(Icons.verified_user_outlined, color: Color(0xFF1769D2)),
          SizedBox(width: 10),
          Expanded(
              child: Text(
                  'تُحفظ السيارة باسم حسابك وتُراجع بياناتها وصورها قبل ظهورها للمستخدمين.',
                  style: TextStyle(fontSize: 12, height: 1.5))),
        ]),
      );

  Widget _section(
          {required IconData icon,
          required String title,
          required Widget child}) =>
      Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Icon(icon, size: 21, color: const Color(0xFF1769D2)),
              const SizedBox(width: 8),
              Text(title,
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w700))
            ]),
            const Divider(height: 24),
            child,
          ]),
        ),
      );

  Widget _imagePicker() =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
              child: Text(
                  '${_images.length} من $maximumImages صور · الحد الأدنى $minimumImages',
                  style:
                      const TextStyle(fontSize: 12, color: Color(0xFF526175)))),
          OutlinedButton.icon(
              onPressed: _images.length >= maximumImages ? null : _pickImages,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: const Text('اختيار')),
        ]),
        if (_images.isNotEmpty) ...[
          const SizedBox(height: 10),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _images.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 7,
                crossAxisSpacing: 7,
                childAspectRatio: 1.15),
            itemBuilder: (context, index) =>
                Stack(fit: StackFit.expand, children: [
              ClipRRect(
                  borderRadius: BorderRadius.circular(5),
                  child:
                      Image.file(File(_images[index].path), fit: BoxFit.cover)),
              Positioned(
                  top: 3,
                  left: 3,
                  child: IconButton.filled(
                      onPressed: () => setState(
                          () => _images = [..._images]..removeAt(index)),
                      icon: const Icon(Icons.close, size: 15),
                      constraints:
                          const BoxConstraints.tightFor(width: 28, height: 28),
                      padding: EdgeInsets.zero,
                      tooltip: 'حذف الصورة')),
            ]),
          ),
        ],
      ]);

  Widget _row(Widget first, Widget second) =>
      LayoutBuilder(builder: (context, constraints) {
        if (constraints.maxWidth < 430) {
          return Column(children: [
            first,
            const SizedBox(height: 10),
            second,
            const SizedBox(height: 10)
          ]);
        }
        return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(child: first),
          const SizedBox(width: 10),
          Expanded(child: second)
        ]);
      });

  Widget _field(String key, String label, {int maxLines = 1, int? maxLength}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextFormField(
          controller: _controllers[key],
          maxLines: maxLines,
          maxLength: maxLength,
          decoration: InputDecoration(
              labelText: label, border: const OutlineInputBorder()),
          validator: label.contains('*')
              ? (value) => value == null || value.trim().isEmpty
                  ? 'هذا الحقل مطلوب'
                  : null
              : null,
        ),
      );

  Widget _numberField(String key, String label,
          {bool required = false, bool decimal = false}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: TextFormField(
          controller: _controllers[key],
          keyboardType: TextInputType.numberWithOptions(decimal: decimal),
          textDirection: TextDirection.ltr,
          decoration: InputDecoration(
              labelText: label, border: const OutlineInputBorder()),
          validator: (value) {
            if (required && (value == null || value.trim().isEmpty)) {
              return 'هذا الحقل مطلوب';
            }
            if (value != null &&
                value.trim().isNotEmpty &&
                num.tryParse(value.trim()) == null) {
              return 'أدخل رقمًا صحيحًا';
            }
            return null;
          },
        ),
      );

  Widget _dropdown(
          {required String label,
          required String value,
          required Map<String, String> items,
          required ValueChanged<String?> onChanged}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: DropdownButtonFormField<String>(
          initialValue: value,
          isExpanded: true,
          decoration: InputDecoration(
              labelText: label, border: const OutlineInputBorder()),
          items: items.entries
              .map((entry) =>
                  DropdownMenuItem(value: entry.key, child: Text(entry.value)))
              .toList(),
          onChanged: onChanged,
        ),
      );

  Widget _dateField(
          String label, DateTime value, ValueChanged<DateTime> onChanged) =>
      InkWell(
        onTap: () => _pickDateTime(value, onChanged),
        borderRadius: BorderRadius.circular(5),
        child: InputDecorator(
          decoration: InputDecoration(
              labelText: label,
              border: const OutlineInputBorder(),
              suffixIcon: const Icon(Icons.calendar_month_outlined)),
          child: Text(DateFormat('yyyy/MM/dd - hh:mm a', 'ar').format(value),
              textDirection: TextDirection.ltr),
        ),
      );

  Future<void> _pickImages() async {
    final selected =
        await _picker.pickMultiImage(imageQuality: 85, maxWidth: 2200);
    if (selected.isEmpty || !mounted) return;
    final paths = _images.map((image) => image.path).toSet();
    setState(() => _images = [
          ..._images,
          ...selected.where((image) => paths.add(image.path))
        ].take(maximumImages).toList());
  }

  Future<void> _pickDateTime(
      DateTime initial, ValueChanged<DateTime> onChanged) async {
    final date = await showDatePicker(
        context: context,
        initialDate: initial,
        firstDate: DateTime.now(),
        lastDate: DateTime.now().add(const Duration(days: 365)));
    if (date == null || !mounted) return;
    final time = await showTimePicker(
        context: context, initialTime: TimeOfDay.fromDateTime(initial));
    if (time == null) return;
    onChanged(
        DateTime(date.year, date.month, date.day, time.hour, time.minute));
  }

  int? _integer(String key) => int.tryParse(_controllers[key]!.text.trim());
  String? _text(String key) {
    final value = _controllers[key]!.text.trim();
    return value.isEmpty ? null : value;
  }

  Future<void> _submit() async {
    setState(() => _error = null);
    if (!_formKey.currentState!.validate()) return;
    if (_images.length < minimumImages) {
      setState(
          () => _error = 'أضف $minimumImages صور واضحة على الأقل قبل الإرسال.');
      return;
    }
    if (!_endsAt.isAfter(_startsAt) || !_startsAt.isAfter(DateTime.now())) {
      setState(() => _error =
          'تحقق من موعد البداية والنهاية؛ يجب أن يبدأ المزاد مستقبلًا وينتهي بعد البداية.');
      return;
    }
    setState(() => _submitting = true);
    try {
      final input = <String, dynamic>{
        'category': _category,
        'make': _text('make'),
        'model': _text('model'),
        'trim': _text('trim'),
        'year': _integer('year'),
        'cityId': _cityId,
        'condition': _condition,
        'mileageKm': _integer('mileageKm'),
        'exteriorColor': _text('exteriorColor'),
        'interiorColor': _text('interiorColor'),
        if (_category != 'Bicycle') 'fuelType': _fuelType,
        if (_category != 'Bicycle') 'transmission': _transmission,
        if (_category != 'Bicycle') 'drivetrain': _drivetrain,
        'engineCapacityCc': _integer('engineCapacityCc'),
        'cylinders': _integer('cylinders'),
        'doors': _integer('doors'),
        'seats': _integer('seats'),
        'bodyType': _text('bodyType'),
        'registrationStatus': _text('registrationStatus'),
        'ownershipStatus': _text('ownershipStatus'),
        'address': _text('address'),
        'startingPriceLyd': _text('startingPriceLyd'),
        'description': _text('description'),
        'bidIncrementLyd': _text('bidIncrementLyd'),
        'reservePriceLyd': _text('reservePriceLyd'),
        'startsAt': _startsAt.toUtc().toIso8601String(),
        'endsAt': _endsAt.toUtc().toIso8601String(),
      }..removeWhere((key, value) => value == null);
      final result = await _repository.createAuctionListing(input);
      await _repository.uploadImages(result.vehicleId, _images);
      if (!mounted) return;
      await _showSuccess(result);
    } catch (error) {
      if (mounted) {
        setState(() => _error = accountError(error));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _showSuccess(SellVehicleResult result) async {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        icon:
            const Icon(Icons.check_circle, color: Color(0xFF138A52), size: 42),
        title: const Text('تم استلام طلبك'),
        content: Text(
          'رقم السيارة: ${result.lotNumber}\nتم رفع الصور وحفظ الطلب للمراجعة.${result.paymentRequired ? '\nرسوم الإدراج: ${result.totalLyd.toStringAsFixed(3)} د.ل، ويمكن إكمال الدفع من حسابك.' : ''}',
          textAlign: TextAlign.center,
        ),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          FilledButton(
              onPressed: () => Navigator.pop(context), child: const Text('تم'))
        ],
      ),
    );
    if (mounted) Navigator.pop(context, true);
  }
}
