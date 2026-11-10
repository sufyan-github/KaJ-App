import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/routing/app_router.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/k_localized_text.dart';

class HelpTopic {
  const HelpTopic({
    required this.icon,
    required this.title,
    required this.entries,
  });

  final List<(String, String)> entries;
  final IconData icon;
  final String title;
}

/// Static help copy kept inside the app so it works offline. Bangla is the
/// source; English comes from the translation catalog.
const helpTopics = <HelpTopic>[
  HelpTopic(
    icon: Icons.login_rounded,
    title: 'সাইন ইন',
    entries: [
      (
        'কীভাবে সাইন ইন করব?',
        'ফোন নম্বর ও পাসওয়ার্ড দিয়ে সাইন ইন করুন। প্রথমবার নম্বরে আসা OTP দিয়ে অ্যাকাউন্ট খুলে পাসওয়ার্ড ঠিক করুন।',
      ),
      (
        'পাসওয়ার্ড ভুলে গেলে কী করব?',
        'সাইন ইন পাতায় পাসওয়ার্ড পুনরুদ্ধার বেছে নিন। নম্বরে আসা OTP দিয়ে নতুন পাসওয়ার্ড দিন। OTP কাউকে বলবেন না।',
      ),
    ],
  ),
  HelpTopic(
    icon: Icons.post_add_outlined,
    title: 'কাজ পোস্ট করা',
    entries: [
      (
        'কীভাবে কাজ পোস্ট করব?',
        'হোম থেকে কাজ পোস্ট করুন বেছে নিন। কাজের ধরন, বিবরণ, সময়, এলাকা ও বাজেট লিখে প্রকাশ করুন। আবেদন এলে নোটিফিকেশন পাবেন।',
      ),
      (
        'কর্মী কীভাবে বাছব?',
        'আমার পোস্ট থেকে আবেদন দেখুন। পরিচয় যাচাই, রিভিউ ও অভিজ্ঞতা দেখে একজনকে গ্রহণ করুন।',
      ),
    ],
  ),
  HelpTopic(
    icon: Icons.send_outlined,
    title: 'কাজে আবেদন',
    entries: [
      (
        'কাজে আবেদন করতে কী লাগে?',
        'আবেদনের আগে NID ও সেলফি দিয়ে পরিচয় যাচাই করতে হয়। প্রশিক্ষণ বা সার্টিফিকেট লাগে না।',
      ),
      (
        'আবেদন করেছি কি না কীভাবে বুঝব?',
        'কাজের বিবরণ পাতায় আবেদন করা হয়েছে লেখা ও আবেদনের অবস্থা দেখা যায়।',
      ),
    ],
  ),
  HelpTopic(
    icon: Icons.where_to_vote_outlined,
    title: 'চেক-ইন ও চেক-আউট',
    entries: [
      (
        'চেক-ইন কীভাবে করব?',
        'কাজের জায়গায় পৌঁছে বুকিং থেকে চেক-ইন চাপুন। লোকেশন অনুমতি দিন। কাজ শেষে একইভাবে চেক-আউট করুন।',
      ),
      (
        'চেক-ইন না হলে কী করব?',
        'খোলা জায়গায় গিয়ে আবার চেষ্টা করুন। তাও না হলে কাজের মালিক চেক-ইন নিশ্চিত করতে পারেন।',
      ),
    ],
  ),
  HelpTopic(
    icon: Icons.event_busy_outlined,
    title: 'বাতিল করা',
    entries: [
      (
        'বুকিং কীভাবে বাতিল করব?',
        'বুকিং খুলে বাতিল করুন বেছে নিন। কারণ বেছে নিলে বাতিলের ফলাফল আগে দেখানো হবে, তারপর নিশ্চিত করুন।',
      ),
      (
        'বারবার বাতিল করলে কী হয়?',
        'শেষ মুহূর্তে বারবার বাতিল করলে নির্ভরযোগ্যতার রেকর্ডে প্রভাব পড়ে। সম্ভব হলে আগে জানান।',
      ),
    ],
  ),
  HelpTopic(
    icon: Icons.payments_outlined,
    title: 'পেমেন্ট',
    entries: [
      (
        'কাজের টাকা কীভাবে দেব বা পাব?',
        'এই সংস্করণে কাজের টাকা সরাসরি নগদে দেওয়া হয়। KAAJ শুধু কাজের মালিকের নিশ্চিতকরণ রেকর্ড করে, কোনো কমিশন নেয় না।',
      ),
      (
        'টাকা নিয়ে সমস্যা হলে?',
        'বুকিং থেকে বিরোধ খুলুন এবং প্রমাণ দিন। আগাম ব্যক্তিগত ট্রান্সফার করবেন না।',
      ),
    ],
  ),
  HelpTopic(
    icon: Icons.health_and_safety_outlined,
    title: 'নিরাপত্তা',
    entries: [
      (
        'বিপদে পড়লে কী করব?',
        'তাৎক্ষণিক বিপদে ৯৯৯-এ কল করুন। KAAJ জরুরি সেবা নয়। পরে অ্যাপ থেকে রিপোর্ট করুন।',
      ),
      (
        'কোন তথ্য শেয়ার করব না?',
        'চ্যাটে NID, পিন, OTP বা পাসওয়ার্ড দেবেন না। কথা ও চুক্তি KAAJ-এর ভেতরে রাখুন।',
      ),
    ],
  ),
  HelpTopic(
    icon: Icons.school_outlined,
    title: 'প্রশিক্ষণ ও সার্টিফিকেট',
    entries: [
      (
        'প্রশিক্ষণ কি বাধ্যতামূলক?',
        'না। প্রশিক্ষণ ঐচ্ছিক। প্রশিক্ষণ ছাড়াও কাজে আবেদন করা যায়। অভিজ্ঞ হলে পাঠ বাদ দিয়ে সরাসরি পরীক্ষা দিতে পারেন।',
      ),
      (
        'সার্টিফিকেট মানে কী?',
        'সার্টিফিকেট শুধু বলে যে আপনি Kaaj জ্ঞান পরীক্ষায় পাস করেছেন। এটি কোনো লাইসেন্স নয়। ভিডিও দেখার জন্য কোনো পুরস্কার নেই।',
      ),
      (
        'পরীক্ষায় পাস না করলে?',
        'ব্যাখ্যা পড়ে আবার চেষ্টা করুন। ২৪ ঘণ্টায় তিনবার পর্যন্ত চেষ্টা করা যায়।',
      ),
    ],
  ),
];

class HelpCentreScreen extends StatelessWidget {
  const HelpCentreScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const KLocalizedText('সহায়তা কেন্দ্র')),
    body: ListView(
      padding: const EdgeInsets.all(KSpacing.md),
      children: [
        const KLocalizedText(
          'সাধারণ প্রশ্নের উত্তর। ইন্টারনেট ছাড়াও পড়া যায়।',
          style: TextStyle(color: KColors.textSecondary),
        ),
        const SizedBox(height: KSpacing.sm),
        for (final topic in helpTopics)
          Card(
            margin: const EdgeInsets.symmetric(vertical: KSpacing.xs),
            clipBehavior: Clip.antiAlias,
            child: ExpansionTile(
              leading: Icon(topic.icon, color: KColors.primary),
              title: KLocalizedText(topic.title),
              childrenPadding: const EdgeInsets.fromLTRB(
                KSpacing.md,
                0,
                KSpacing.md,
                KSpacing.md,
              ),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final (question, answer) in topic.entries) ...[
                  KLocalizedText(
                    question,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: KSpacing.xs),
                  KLocalizedText(answer),
                  const SizedBox(height: KSpacing.md),
                ],
              ],
            ),
          ),
        const SizedBox(height: KSpacing.md),
        Card(
          key: const ValueKey('help-support-contact'),
          color: KColors.surfaceAlt,
          child: ListTile(
            leading: const Icon(Icons.support_agent_outlined),
            title: const KLocalizedText('KAAJ সহায়তার সঙ্গে যোগাযোগ'),
            subtitle: const KLocalizedText(
              'নিরাপত্তা সমস্যা, রিপোর্ট বা বিরোধের জন্য সহায়তা ও নিরাপত্তা পাতা খুলুন।',
            ),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => context.push(AppRoutes.helpSafety),
          ),
        ),
      ],
    ),
  );
}
