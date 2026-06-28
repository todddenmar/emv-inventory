"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { BrandLogo, BRAND_NAME } from "@/components/layout/brand-logo";
import { getPublicBranches } from "@/lib/firestore/branches";
import { getSiteSettings } from "@/lib/firestore/site-settings";
import { branchMapUrl } from "@/lib/location";
import { cn } from "@/lib/utils";
import type { Branch, SiteSettings, SocialLink, SocialPlatform } from "@/types";

const SOCIAL_ICONS: Record<
  SocialPlatform,
  React.ComponentType<{ className?: string }>
> = {
  facebook: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
  instagram: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  ),
  twitter: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  tiktok: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.75a8.18 8.18 0 0 0 4.77 1.52V6.88a4.85 4.85 0 0 1-1-.19z" />
    </svg>
  ),
  youtube: ({ className }) => (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  website: Globe,
};

function SocialIconLink({ link }: { link: SocialLink }) {
  const Icon = SOCIAL_ICONS[link.platform] ?? Globe;
  const label =
    link.label ||
    link.platform.charAt(0).toUpperCase() + link.platform.slice(1);

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-brand-yellow/30 text-brand-yellow transition-colors hover:bg-brand-yellow hover:text-brand-black"
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}

export function SiteFooter() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    Promise.all([
      getSiteSettings().catch(() => null),
      getPublicBranches().catch(() => [] as Branch[]),
    ]).then(([site, branchList]) => {
      setSettings(site);
      setBranches(branchList);
    });
  }, []);

  const hasContact =
    settings?.footerAddress ||
    settings?.footerPhone ||
    settings?.footerEmail;
  const socialLinks =
    settings?.socialLinks.filter((link) => link.url.trim()) ?? [];

  return (
    <footer className="border-t border-brand-yellow/20 bg-brand-black text-brand-yellow">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-4">
            <BrandLogo size="md" nameClassName="text-brand-yellow" />
            <p className="max-w-sm text-sm text-brand-yellow/70">
              Quality products delivered to your door. Pay cash on delivery.
            </p>
            {socialLinks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {socialLinks.map((link, index) => (
                  <SocialIconLink key={`${link.platform}-${index}`} link={link} />
                ))}
              </div>
            )}
          </div>

          {hasContact && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-yellow/70">
                Contact
              </h3>
              <ul className="space-y-3 text-sm">
                {settings?.footerAddress && (
                  <li className="flex gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-yellow" />
                    <span className="whitespace-pre-line text-brand-yellow/90">
                      {settings.footerAddress}
                    </span>
                  </li>
                )}
                {settings?.footerPhone && (
                  <li>
                    <a
                      href={`tel:${settings.footerPhone.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-3 transition-opacity hover:opacity-80"
                    >
                      <Phone className="h-4 w-4 shrink-0" />
                      {settings.footerPhone}
                    </a>
                  </li>
                )}
                {settings?.footerEmail && (
                  <li>
                    <a
                      href={`mailto:${settings.footerEmail}`}
                      className="inline-flex items-center gap-3 transition-opacity hover:opacity-80"
                    >
                      <Mail className="h-4 w-4 shrink-0" />
                      {settings.footerEmail}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}

          {branches.length > 0 && (
            <div className="space-y-4 md:col-span-2 lg:col-span-1">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-yellow/70">
                Our branches
              </h3>
              <ul className="space-y-4">
                {branches.map((branch) => {
                  const mapUrl = branchMapUrl(branch);
                  return (
                    <li
                      key={branch.id}
                      className="rounded-xl border border-brand-yellow/20 bg-brand-yellow/5 p-4 text-sm"
                    >
                      <p className="font-semibold">{branch.name}</p>
                      {branch.address && (
                        <p className="mt-1 text-brand-yellow/80">{branch.address}</p>
                      )}
                      {branch.phone && (
                        <p className="mt-1 text-brand-yellow/70">{branch.phone}</p>
                      )}
                      {mapUrl && (
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-yellow underline-offset-2 hover:underline"
                        >
                          <MapPin className="h-3 w-3" />
                          View on map
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div
          className={cn(
            "mt-10 flex flex-col items-center justify-between gap-3 border-t border-brand-yellow/20 pt-6 text-xs text-brand-yellow/60 sm:flex-row"
          )}
        >
          <p>© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/shop" className="hover:text-brand-yellow">
              Shop
            </Link>
            <Link href="/" className="hover:text-brand-yellow">
              Home
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
