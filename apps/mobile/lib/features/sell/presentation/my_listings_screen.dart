import 'package:flutter/material.dart';

import '../../../core/api/api_client.dart';
import '../../vehicles/domain/vehicle.dart';
import '../data/listing_repository.dart';
import 'new_listing_screen.dart';

const _statusLabels = <String, String>{
  'Draft': 'مسودة',
  'PendingReview': 'بانتظار المراجعة',
  'Rejected': 'مرفوضة',
  'Published': 'منشورة',
  'Archived': 'مؤرشفة',
};

class MyListingsScreen extends StatefulWidget {
  const MyListingsScreen({super.key});
  @override
  State<MyListingsScreen> createState() => _MyListingsScreenState();
}

class _MyListingsScreenState extends State<MyListingsScreen> {
  final _repository = ListingRepository(ApiClient());
  late Future<List<Vehicle>> _listings = _repository.mine();
  void _reload() {
    final next = _repository.mine();
    setState(() {
      _listings = next;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('إعلاناتي')),
        body: FutureBuilder<List<Vehicle>>(
            future: _listings,
            builder: (context, snapshot) {
              if (!snapshot.hasData)
                return Center(
                    child: snapshot.hasError
                        ? TextButton.icon(
                            onPressed: _reload,
                            icon: const Icon(Icons.refresh),
                            label: const Text('إعادة المحاولة'))
                        : const CircularProgressIndicator());
              final vehicles = snapshot.data!;
              if (vehicles.isEmpty)
                return const Center(child: Text('لم تضف أي إعلان بعد'));
              return RefreshIndicator(
                onRefresh: () async {
                  _reload();
                  await _listings;
                },
                child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: vehicles.length,
                    itemBuilder: (context, index) {
                      final vehicle = vehicles[index];
                      final editable = vehicle.approvalStatus == 'Draft' ||
                          vehicle.approvalStatus == 'Rejected';
                      return Card(
                          child: ListTile(
                        leading: const Icon(Icons.directions_car_outlined),
                        title: Text(vehicle.title),
                        subtitle: Text(
                            '${vehicleCategoryLabels[vehicle.category] ?? 'أخرى'} · ${_statusLabels[vehicle.approvalStatus] ?? vehicle.approvalStatus ?? ''}'),
                        trailing:
                            editable ? const Icon(Icons.edit_outlined) : null,
                        onTap: editable
                            ? () async {
                                await Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                        builder: (_) =>
                                            NewListingScreen(draft: vehicle)));
                                _reload();
                              }
                            : null,
                      ));
                    }),
              );
            }),
      );
}
